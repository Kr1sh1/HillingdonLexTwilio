import { ServerlessFunctionSignature } from '@twilio-labs/serverless-runtime-types/types';
import { RespondServerlessEventObject, TwilioEnvironmentVariables } from './types/interfaces';
import { sleep } from "openai/core";
import { MessageContentImageFile, MessageContentText, Run, ThreadMessage } from "openai/resources/beta/threads";
import { ClientManager } from "./helpers/clients";

export const handler: ServerlessFunctionSignature<TwilioEnvironmentVariables, RespondServerlessEventObject> = async function (
  context,
  event,
  callback
) {
  const openai = ClientManager.getOpenAIClient(context)
  const twiml_response = new Twilio.twiml.VoiceResponse();
  const response = new Twilio.Response();

  const cookies = event.request.cookies;
  const callThread = cookies.threadID;
  const newMessage = event.SpeechResult;

  const aiResponse = await generateAIResponse(newMessage);
  if (!aiResponse) return callback("Assistant failed to respond"); // Return early if response failed.
  const cleanedAiResponse = aiResponse.replace(/^\w+:\s*/i, "").trim();

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

  async function addMessageToThread(message: string) {
    return await openai.beta.threads.messages.create(callThread, {
      role: "user",
      content: message
    });
  }

  async function generateAIResponse(newMessage: string) {
    try {
      return await updateThread(newMessage);
    } catch (error) {
      console.error("Error generating AI response:", error);
      throw error;
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
    const message = await addMessageToThread(newMessage);
    const run = await startNewRun();
    await waitForRunCompletion(run);
    return retrieveMessagesFromThread(message);
  }

  async function waitForRunCompletion(run: Run) {
    while (true) {
      if (run.status === "queued" || run.status === "in_progress") {
        await sleep(1000); // Wait for 1 second before checking again
        run = await openai.beta.threads.runs.retrieve(callThread, run.id);
      } else {
        break; // Exit the loop if run is not defined or status is not queued or in_progress
      }
    }
  }

  async function retrieveMessagesFromThread(message: ThreadMessage) {
    const pages = await openai.beta.threads.messages.list(callThread, { after: message.id, order: "asc" });
    let messages: ThreadMessage[] = []

    for await (const page of pages.iterPages()) {
      messages = messages.concat(page.getPaginatedItems())
    }

    function isMessageContentText(message: MessageContentText | MessageContentImageFile): message is MessageContentText {
      return message.type === "text"
    }

    const formattedMessages = messages.map(message => {
      const textMessage: MessageContentText = message.content.filter(isMessageContentText)[0]
      return textMessage.text.value;
    })

    return formattedMessages.join(" ");
  }
}
