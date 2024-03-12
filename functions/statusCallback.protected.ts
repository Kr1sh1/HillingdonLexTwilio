import { ServerlessFunctionSignature } from '@twilio-labs/serverless-runtime-types/types';
import { StatusCallbackServerlessEventObject, SyncDocumentData, Tasks, TwilioEnvironmentVariables } from './types/interfaces';
import { connect, config, Request, TYPES } from 'mssql';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { ClientManager } from './helpers/clients';
import { fetchThreadConversation } from './helpers/assistant';
import { SQLParams } from './types/types';
import { SendMessageBatchCommand, SendMessageBatchRequestEntry } from '@aws-sdk/client-sqs';

const constructRequest = (request: Request, params: SQLParams) => {
  const fieldNames = params.map((param) => param.fieldName)

  const columns = fieldNames.join(", ")
  const values = "@" + fieldNames.join(", @")
  const builtRequest = params.reduce((req, param) => req.input(param.fieldName, param.type, param.value), request)

  return { columns, values, builtRequest }
}

export const handler: ServerlessFunctionSignature<TwilioEnvironmentVariables, StatusCallbackServerlessEventObject> = async function (
  context,
  event,
  callback,
) {
  if (event.CallStatus === "completed") {
    const twilioClient = ClientManager.getTwilioClient(context)
    const syncClient = ClientManager.getSyncClient(context)

    const documentPromise = syncClient
      .documents(event.CallSid + "NotSID")
      .fetch()
      .then(async (doc) => {
        const data: SyncDocumentData = doc.data
        const S3Upload = uploadConversationToS3(data.threadId)
        const SQSUpload = uploadTaskstoSQS(data.tasks)
        await Promise.all([S3Upload, SQSUpload]);
        return doc;
      })

    const callDetailsPromise = twilioClient
      .calls(event.CallSid)
      .fetch()
      .then((call) => {
        return {
          from: call.from,
          startTime: call.startTime,
          endTime: call.endTime,
          duration: +call.duration
        }
      })

    const serverConfig: config = {
      user: context.RDS_USER,
      password: context.RDS_PASSWORD,
      server: context.RDS_SERVER,
      port: +context.RDS_PORT,
      database: context.RDS_DATABASE,
      options: {
        encrypt: true,
        trustServerCertificate: false
      }
    };

    const [pool, callDetails] = await Promise.all([connect(serverConfig), callDetailsPromise])

    let insertParams: SQLParams = [
      {
        fieldName: "callerNumber",
        value: callDetails.from,
        type: TYPES.VarChar
      },
      {
        fieldName: "callStartTimestamp",
        value: callDetails.startTime,
        type: TYPES.DateTime
      },
      {
        fieldName: "callEndTimestamp",
        value: callDetails.endTime,
        type: TYPES.DateTime
      },
      {
        fieldName: "callDurationInSeconds",
        value: callDetails.duration,
        type: TYPES.SmallInt
      },
      {
        fieldName: "logFileName",
        value: `${event.CallSid}.json`,
        type: TYPES.VarChar
      }
    ]

    const { columns, values, builtRequest } = constructRequest(pool.request(), insertParams)

    let sqlQuery = `
    INSERT INTO CallRecords (${columns})
    VALUES (${values})
    `

    await builtRequest.query(sqlQuery)
    await Promise.all([pool.close(), documentPromise])
  }
  return callback(null)

  async function uploadConversationToS3(threadId: string) {
    const openai = ClientManager.getOpenAIClient(context)
    const conversation = await fetchThreadConversation(openai, threadId, { order: "asc" })

    const s3Client = ClientManager.getS3Client(context)

    await s3Client.send(
      new PutObjectCommand({
        Bucket: context.AWS_S3_BUCKET,
        Key: `${event.CallSid}.json`,
        Body: JSON.stringify(conversation),
      })
    );
  }

  async function uploadTaskstoSQS(tasks: Tasks) {
    const sqsClient = ClientManager.getSQSClient(context)

    const entries = Object.entries(tasks).map(([taskName, taskParameters]) => {
      return {
        Id: taskName,
        MessageBody: JSON.stringify({
          callSid: event.CallSid,
          phoneNumber: event.From,
          taskName,
          taskParameters,
        }),
        MessageGroupId: taskName,
        MessageDeduplicationId: event.CallSid + taskName
      } as SendMessageBatchRequestEntry
    })

    if (!entries.length) return;

    await sqsClient.send(
      new SendMessageBatchCommand({
        QueueUrl: context.AWS_SQS_URL,
        Entries: entries,
      })
    )
  }
}
