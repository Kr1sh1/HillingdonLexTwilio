import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SendMessageBatchCommand, SendMessageBatchRequestEntry } from "@aws-sdk/client-sqs"
import { Context } from "../types/types";
import { fetchThreadConversation } from "./assistant";
import { ClientManager } from "./clients";
import { Tasks } from "../types/interfaces";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { StreamingBlobPayloadInputTypes } from "@smithy/types";

export async function uploadConversationToS3(context: Context, callSid: string, threadId: string) {
  const openai = ClientManager.getOpenAIClient(context)
  const conversation = await fetchThreadConversation(openai, threadId, { order: "asc" })
  const s3Client = ClientManager.getS3Client(context)
  await uploadObjectToS3(s3Client, context, context.AWS_S3_BUCKET, `${callSid}.json`, JSON.stringify(conversation))
}

export async function uploadAudioToS3(context: Context, audioFileName: string, buffer: Buffer) {
  const awsConfig = ClientManager.getAWSConfig(context)
  awsConfig.region = "us-east-1"
  const s3Client = new S3Client(awsConfig)
  await uploadObjectToS3(s3Client, context, "eleven-labs-bucket", audioFileName, buffer)
}

async function uploadObjectToS3(s3Client: S3Client, context: Context, bucketName: string, key: string, data: StreamingBlobPayloadInputTypes) {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: data,
    })
  );
}

export function createPresignedUrl(context: Context, Key: string) {
  const awsConfig = ClientManager.getAWSConfig(context)
  awsConfig.region = "us-east-1"
  const s3Client = new S3Client(awsConfig)
  const command = new GetObjectCommand({ Bucket: "eleven-labs-bucket", Key });
  return getSignedUrl(s3Client, command, { expiresIn: 180 });
};

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
