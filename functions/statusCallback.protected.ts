import { ServerlessFunctionSignature } from '@twilio-labs/serverless-runtime-types/types';
import { SQLParam, StatusCallbackServerlessEventObject, TwilioEnvironmentVariables } from './types/interfaces';
import { connect, config, Request, TYPES } from 'mssql';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

type SQLParams = SQLParam[]

const constructRequest = (request: Request, params: SQLParams) => {
  const fieldNames = params.map((param) => param.fieldName)

  const columns = fieldNames.join(", ")
  const values = "@" + fieldNames.join(", @")
  const builtRequest = params.reduce((req, param) => req.input(param.fieldName, param.type, param.value), request)

  return { columns, values, builtRequest }
}

export const handler: ServerlessFunctionSignature<TwilioEnvironmentVariables, StatusCallbackServerlessEventObject> = async function(
  context,
  event,
  callback,
) {
  if (event.CallStatus === "completed") {
    const callDetailsPromise = new Twilio.Twilio(context.ACCOUNT_SID, context.AUTH_TOKEN).calls(event.CallSid)
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

    const [pool, logFileCreated, callDetails] = await Promise.all([connect(serverConfig), checkLogFileCreated(), callDetailsPromise])

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
      }
    ]

    if (logFileCreated) {
      insertParams.push({
        fieldName: "logFileName",
        value: `${event.CallSid}.json`,
        type: TYPES.VarChar
      })
    }

    const { columns, values, builtRequest } = constructRequest(pool.request(), insertParams)

    let sqlQuery = `
    INSERT INTO CallRecords (${columns})
    VALUES (${values})
    `

    await builtRequest.query(sqlQuery)
    await pool.close()
  }
  const response = new Response();
  return callback(null, response)

  async function checkLogFileCreated() {
    const s3Client = new S3Client(
      {
        region: context.AWS_REGION,
        credentials: {
          accessKeyId: context.AWS_ACCESS_KEY_ID,
          secretAccessKey: context.AWS_SECRET_ACCESS_KEY,
        }
      }
    );
    return s3Client.send(
      new GetObjectCommand({
        Bucket: context.AWS_S3_BUCKET,
        Key: `${event.CallSid}.json`,
      })
    )
      .then(() => true)
      .catch((error) => {
        if (error.Code != "NoSuchKey") throw error;
        return false;
      })
  }
}
