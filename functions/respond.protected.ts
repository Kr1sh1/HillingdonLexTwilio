import OpenAI from "openai";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { ServerlessFunctionSignature } from '@twilio-labs/serverless-runtime-types/types';
import { RespondServerlessEventObject, TwilioEnvironmentVariables } from './types/interfaces';
import {MessageContentImageFile, MessageContentText} from "openai/resources/beta/threads";



interface Message {
  role: 'user' | 'assistant';
  content: string;
}

type Conversation = Message[];

export const handler: ServerlessFunctionSignature<TwilioEnvironmentVariables, RespondServerlessEventObject> = async function(
  context,
  event,
  callback
) {
  const openai = new OpenAI({ apiKey: context.OPENAI_API_KEY });
  const s3Client = new S3Client(
    {
      region: context.AWS_REGION,
      credentials: {
        accessKeyId: context.AWS_ACCESS_KEY_ID,
        secretAccessKey: context.AWS_SECRET_ACCESS_KEY,
      }
    }
  );
  const twiml_response = new Twilio.twiml.VoiceResponse();
  const response = new Twilio.Response();

  const cookies = event.request.cookies;
  const callThread = cookies.threadID;
  const userLog = {
    role: "user",
    content: event.SpeechResult,
  };



  const newMessage = JSON.stringify(userLog.content);
  const aiResponse = await generateAIResponse(newMessage);
  if (aiResponse == null) return; // Return early if aiResponse is null or undefined
  const cleanedAiResponse = aiResponse.content.replace(/^\w+:\s*/i, "").trim();

  const assistantLog = {
    role: "assistant",
    content: cleanedAiResponse,
  };




  twiml_response.say({
    voice: "Polly.Joanna-Neural",
  },
    cleanedAiResponse
  );

  twiml_response.redirect({
    method: "POST",
  },
    `/transcribe`
  );

  response.appendHeader("Content-Type", "application/xml");
  response.setBody(twiml_response.toString());

  return callback(null, response);

async function generateAIResponse(newMessage: string) {
    return await updateThread(newMessage);
  }

  async function updateThread(newMessage: string) {
      const run = await openai.beta.threads.runs.create(
          callThread,
          {assistant_id: context.OPENAI_ASSISTANT_ID},
      );

      await addMessageToThread(callThread, newMessage);

      const retrieveRun = async () => {
          let keepRetrievingRun;

          while (run.status === "queued" || run.status === "in_progress") {
              keepRetrievingRun = await openai.beta.threads.runs.retrieve(
                  callThread,
                  run.id
              );
              console.log(`Run status: ${keepRetrievingRun.status}`);

              if (keepRetrievingRun.status === "completed") {
                  console.log("\n");

                  // Step 7: Retrieve the Messages added by the Assistant to the Thread
                  const threadPage = await openai.beta.threads.messages.list(
                      callThread,
                      {
                          limit : 1,
                          order : "desc"
                      }
                  );
                  const threadMessage = threadPage.getPaginatedItems()[0]
                  let splitMessages: MessageContentText[] = threadMessage.content.filter(isMessageContentText)
                    const messagesConverted = splitMessages.map(singleMessage => {
                      return {
                        role: threadMessage.role,
                        content: singleMessage.text.value
                      }
                    })

                function isMessageContentText(message: MessageContentText | MessageContentImageFile): message is MessageContentText {
                  return message.type === "text"
                }

                  return messagesConverted[0];
                  break;

              } else if (
                  keepRetrievingRun.status === "queued" ||
                  keepRetrievingRun.status === "in_progress"
              ) {
                  // pass
              } else {
                  console.log(`Run status: ${keepRetrievingRun.status}`);
                  break;
              }
          }
      };
      return await retrieveRun();
  }

  async function addMessageToThread(callThread: string, message: string) {
    try {
        // Add message to thread using OpenAI API
        await openai.beta.threads.messages.create(callThread, {
                role: "user", // Ensure 'role' is set
                content: message // Ensure 'content' is set
        });

    } catch (error) {
        // Handle errors related to adding message to thread
        console.error("Error adding message to thread:", error);
        throw error; // Propagate the error to the caller
    }
}


  async function uploadToS3(logs: Conversation, logFileName: string) {
    const existingContent = await s3Client.send(
      new GetObjectCommand({
        Bucket: context.AWS_S3_BUCKET,
        Key: logFileName,
      })
    )
      .then((response) => response.Body?.transformToString())
      .catch((error) => {
        if (error.Code != "NoSuchKey") throw error;
        console.log(`Creating ${logFileName} for the first time`);
      })
      .then((string) => string ? JSON.parse(string) : [])

    // Push the ammended JSON file onto S3, overwriting the previous one if it existed.
    await s3Client.send(
      new PutObjectCommand({
        Bucket: context.AWS_S3_BUCKET,
        Key: logFileName,
        Body: JSON.stringify([...existingContent, ...logs]),
      })
    );
  }
}

