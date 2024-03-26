import { PutObjectCommand } from "@aws-sdk/client-s3";
import { SendMessageBatchCommand, SendMessageBatchRequestEntry } from "@aws-sdk/client-sqs"
import { Context } from "../types/types";
import { fetchThreadConversation } from "./assistant";
import { ClientManager } from "./clients";
import { Tasks } from "../types/interfaces";
import { Readable } from "stream";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import https from "https";

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

export async function uploadAudioToS3(context: Context, callSid: string, audioStream: Readable) {
  const s3Client = ClientManager.getS3Client(context);

  // Generate presigned URL
  const presignedUrl = await createPresignedUrlWithClient(s3Client,{
    region: context.AWS_REGION,
    bucket: context.AWS_S3_BUCKET,
    key: `${callSid}.wav`, // Adjust file extension as needed
  });

  // Upload audio
  await put(presignedUrl, audioStream);
}

const createPresignedUrlWithClient = (s3Client, { region, bucket, key }) => {
  const client = s3Client;
  const command = new PutObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: 3600 });
};

function put(url, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: "PUT", headers: { "Content-Length": new Blob([data]).size } },
      (res) => {
        let responseBody = "";
        res.on("data", (chunk) => {
          responseBody += chunk;
        });
        res.on("end", () => {
          resolve(responseBody);
        });
      },
    );
    req.on("error", (err) => {
      reject(err);
    });
    req.write(data);
    req.end();
  });
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
