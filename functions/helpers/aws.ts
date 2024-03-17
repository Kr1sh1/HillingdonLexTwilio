import { PutObjectCommand } from "@aws-sdk/client-s3";
import { SendMessageBatchCommand, SendMessageBatchRequestEntry } from "@aws-sdk/client-sqs"
import { Context } from "../types/types";
import { fetchThreadConversation } from "./assistant";
import { ClientManager } from "./clients";
import { Tasks } from "../types/interfaces";

export async function uploadConversationToS3(context: Context, callSid: string, threadId: string) {
  const openai = ClientManager.getOpenAIClient(context)
  const conversation = await fetchThreadConversation(openai, threadId, { order: "asc" })

  const s3Client = ClientManager.getS3Client(context)

  await s3Client.send(
    new PutObjectCommand({
      Bucket: context.AWS_S3_BUCKET,
      Key: `${callSid}.json`,
      Body: JSON.stringify(conversation),
    })
  );
}

export async function uploadTaskstoSQS(context: Context, callSid: string, phoneNumber: string, tasks: Tasks) {
  const sqsClient = ClientManager.getSQSClient(context)

  const entries = Object.entries(tasks).map(([taskName, taskParameters]) => {
    return {
      Id: taskName,
      MessageBody: JSON.stringify({
        callSid,
        phoneNumber,
        taskName,
        taskParameters,
      }),
      MessageGroupId: taskName,
      MessageDeduplicationId: callSid + taskName
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
