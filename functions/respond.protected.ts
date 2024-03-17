import { ServerlessFunctionSignature } from '@twilio-labs/serverless-runtime-types/types';
import { AIResponse, RespondServerlessEventObject, TwilioEnvironmentVariables, ToolOutput } from './types/interfaces';
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

  const cookies = event.request.cookies;
  const threadId = cookies.threadID;
  const newMessage = event.SpeechResult;

  if (!newMessage) {
    twiml_response.say({ voice: "Polly.Joanna-Neural" }, "Sorry, I didn't catch that.");
    twiml_response.redirect({ method: "POST" }, "/transcribe");
    return callback(null, twiml_response)
  }

  const aiResponse = await generateAIResponse(newMessage);
  if (!aiResponse.text) return callback("Assistant failed to respond"); // Return early if response failed.
  const cleanedAiResponse = aiResponse.text.replace(/^\w+:\s*/i, "").trim();

  twiml_response.say({ voice: "Polly.Joanna-Neural" }, cleanedAiResponse);

  switch (aiResponse.action) {
    case AIAction.NONE:
      twiml_response.redirect({ method: "POST" }, "/transcribe");
      break;
    case AIAction.TRANSFER:
    case AIAction.TERMINATE:
      break
  }

  await Promise.all(aiResponse.promises)

  return callback(null, twiml_response);

  async function generateAIResponse(newMessage: string): Promise<AIResponse> {
    try {
      const message = await addMessageToThread(openai, threadId, newMessage);
      const run = await startNewRun(openai, threadId, context.OPENAI_ASSISTANT_ID)
      const result = await waitForRunCompletion(run);
      const text = await fetchAssistantResponse(openai, threadId, message)
      return {
        text,
        ...result
      }
    } catch (error) {
      console.error("Error generating AI response:", error);
      throw error;
    }
  }

  async function waitForRunCompletion(run: Run) {
    let results: ToolOutput[] = []
    while (true) {
      if (run.status === "queued" || run.status === "in_progress") {
        await sleep(100); // Wait for 0.1 second before checking again
        run = await openai.beta.threads.runs.retrieve(threadId, run.id);
      } else if (run.status === "requires_action" && run.required_action?.type == "submit_tool_outputs") {
        const outputs = processToolCalls(run.required_action.submit_tool_outputs.tool_calls)
        results = results.concat(outputs)
        run = await openai.beta.threads.runs.submitToolOutputs(threadId, run.id, {
          tool_outputs: outputs.map(output => {
            return {
              tool_call_id: output.id,
              output: output.functionOutput.response
            }
          })
        });
      } else {
        break; // Exit the loop if status is not queued or in_progress
      }
    }
    return filterResults(results)
  }

  function filterResults(results: ToolOutput[]) {
    const promises = results.flatMap(result => result.functionOutput.promises ?? [])
    let action = AIAction.NONE
    for (const result of results) {
      if (result.functionOutput.action !== AIAction.NONE) {
        action = result.functionOutput.action
        break
      }
    }
    return { action, promises }
  }

  function processToolCalls(toolCalls: RequiredActionFunctionToolCall[]): ToolOutput[] {
    return toolCalls.map((tool_call) => {
      const parameters = JSON.parse(tool_call.function.arguments)
      const processor = taskProcessors[tool_call.function.name]
      return {
        id: tool_call.id,
        functionOutput: processor(parameters, context, event),
      }
    })
  }
}
