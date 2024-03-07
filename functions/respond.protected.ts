import OpenAI from "openai";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { ServerlessFunctionSignature } from '@twilio-labs/serverless-runtime-types/types';
import { RespondServerlessEventObject, TwilioEnvironmentVariables } from './types/interfaces';
import {sleep} from "openai/core";
import {MessageContentImageFile, MessageContentText} from "openai/resources/beta/threads";



interface Message {
  role: 'user' | 'assistant';
  content: string;
}


export const handler: ServerlessFunctionSignature<TwilioEnvironmentVariables, RespondServerlessEventObject> = async function(
  context,
  event,
  callback
) {
    const openai = new OpenAI({apiKey: context.OPENAI_API_KEY});
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

    await waitForPreviousRunCompletion(); // Wait for the previous run to complete
    await addMessageToThread(newMessage);

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

    async function waitForPreviousRunCompletion() {
        let runStatus;
        do {
            const runs = await openai.beta.threads.runs.list(callThread);
            const latestRun = runs.data[0]; // Get the latest run
            runStatus = latestRun.status;

            if (runStatus === "queued" || runStatus === "in_progress" || runStatus === "requires_action" || runStatus === "cancelling") {
                console.log("Previous run is still active. Waiting...");
                await sleep(1000); // Wait for 1 second before checking again
            }
        } while (runStatus === "queued" || runStatus === "in_progress" || runStatus === "requires_action" || runStatus === "cancelling");
    }

    async function addMessageToThread(message: string) {
        try {
            await openai.beta.threads.messages.create(callThread, {
                role: "user",
                content: message
            });
        } catch (error) {
            console.error("Error adding message to thread:", error);
            throw error;
        }
    }

    async function generateAIResponse(newMessage: string) {
        try {
            return await updateThread(newMessage);
        } catch (error) {
            console.error("Error generating AI response:", error);
            return null;
        }
    }

    async function startNewRun() {
        try {
            const run = await openai.beta.threads.runs.create(callThread, { assistant_id: context.OPENAI_ASSISTANT_ID });
            return run;
        } catch (error) {
            console.error("Error starting new run:", error);
            throw error;
        }
    }


    async function updateThread(newMessage: string) {
        await addMessageToThread(newMessage);
        const run = await startNewRun();
        await waitForRunCompletion({run: run});
        return retrieveMessagesFromThread();
    }


    async function waitForRunCompletion({run}: { run: any }) {
        while (true) {
            if (run && (run.status === "queued" || run.status === "in_progress")) {
                await sleep(1000); // Wait for 1 second before checking again
                try {
                    run = await openai.beta.threads.runs.retrieve(callThread, run.id);
                } catch (error) {
                    console.error("Error retrieving run status:", error);
                    throw error;
                }
            } else {
                break; // Exit the loop if run is not defined or status is not queued or in_progress
            }
        }
    }

    async function retrieveMessagesFromThread() {
        const threadPage = await openai.beta.threads.messages.list(callThread, { limit: 1, order: "desc" });

        const threadMessage = threadPage.getPaginatedItems()[0];
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
    }

}



