import { ServerlessFunctionSignature } from '@twilio-labs/serverless-runtime-types/types';
import { AIResponse, RespondServerlessEventObject, SyncDocumentData, TwilioEnvironmentVariables, toolOutput } from './types/interfaces';
import { sleep } from "openai/core";
import { RequiredActionFunctionToolCall, Run } from "openai/resources/beta/threads";
import { ClientManager } from "./helpers/clients";
import { addMessageToThread, fetchAssistantResponse, startNewRun } from './helpers/assistant';
import { AIAction } from './types/enums';
import { taskProcessors } from './helpers/tasks';

export const handler: ServerlessFunctionSignature<TwilioEnvironmentVariables, RespondServerlessEventObject> = async function (
  context,
  event,
  callback
) {
  if (event.CallStatus !== "in-progress") return callback(null)

  const openai = ClientManager.getOpenAIClient(context)
  const twiml_response = new Twilio.twiml.VoiceResponse();
  const response = new Twilio.Response();

  const cookies = event.request.cookies;
  const threadId = cookies.threadID;
  const newMessage = event.SpeechResult;

  const aiResponse = await generateAIResponse(newMessage);
  if (!aiResponse) return callback("Assistant failed to respond"); // Return early if response failed.
  const cleanedAiResponse = aiResponse.replace(/^\w+:\s*/i, "").trim();

  twiml_response.say({ voice: "Polly.Joanna-Neural" }, cleanedAiResponse);

  twiml_response.redirect({
    method: "POST",
  },
    `/transcribe`
  );

  response.appendHeader("Content-Type", "application/xml");
  response.setBody(twiml_response.toString());

  return callback(null, response);

  return callback(null, response);

  async function generateAIResponse(newMessage: string) {
    try {
      return await updateThread(newMessage);
    } catch (error) {
      console.error("Error generating AI response:", error);
      throw error;
    }
  }

  async function waitForRunCompletion(run: Run) {
    while (true) {
      if (run.status === "queued" || run.status === "in_progress") {
        await sleep(100); // Wait for 0.1 second before checking again
        run = await openai.beta.threads.runs.retrieve(callThread, run.id);
      } else if (run.status === "requires_action" && run.required_action) {
        run = await openai.beta.threads.runs.submitToolOutputs(
          callThread,
          run.id,
        {
          tool_outputs: [
            {
              tool_call_id: run.required_action.submit_tool_outputs.tool_calls[0].id,
              output: "true",
            },
          ],
        });
      } else {
        break; // Exit the loop if status is not queued or in_progress
      }
    }
  }

  }
}
