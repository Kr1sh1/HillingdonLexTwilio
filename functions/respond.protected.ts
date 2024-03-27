import { ServerlessFunctionSignature } from '@twilio-labs/serverless-runtime-types/types';
import { AIResponse, RespondServerlessEventObject, ToolOutput, TwilioEnvironmentVariables } from './types/interfaces';
import { ClientManager } from "./helpers/clients";
import { initializeElevenLabsSocket } from './helpers/eleven';
import { AIAction } from './types/enums';
import { addMessageToThread, startNewStreamingRun } from './helpers/assistant';
import { RequiredActionFunctionToolCall } from 'openai/resources/beta/threads';
import { taskProcessors } from './helpers/tasks';
import { createPresignedUrl, uploadAudioToS3 } from './helpers/aws';

export const handler: ServerlessFunctionSignature<TwilioEnvironmentVariables, RespondServerlessEventObject> = async function (
  context,
  event,
  callback
) {
  if (event.CallStatus !== "in-progress") return callback(null)

  const openai = ClientManager.getOpenAIClient(context);
  const twiml_response = new Twilio.twiml.VoiceResponse();

  const cookies = event.request.cookies;
  const callThread = cookies.threadID;
  const newMessage = event.SpeechResult;

  if (!newMessage) {
    twiml_response.redirect({ method: "POST" }, "/transcribe");
    return callback(null, twiml_response)
  }

  const aiResponse = await generateAIResponse(newMessage);

  const [audioUrl] = await Promise.all([aiResponse.audioUrl, ...aiResponse.promises])

  if (audioUrl)
    twiml_response.play(audioUrl);

  switch (aiResponse.action) {
    case AIAction.NONE:
      twiml_response.redirect({ method: "POST" }, "/transcribe");
      break;
    case AIAction.TRANSFER:
      twiml_response
        .dial({ timeout: 10 })
        .number({ statusCallback: "/statusCallback", statusCallbackEvent: ["initiated"] }, "+448088127045")
      break
    case AIAction.TERMINATE:
      break
  }

  return callback(null, twiml_response);

  async function generateAIResponse(newMessage: string): Promise<AIResponse> {
    try {
      const audioBuffer: Buffer[] = []
      const { socket, socketClose } = initializeElevenLabsSocket(audioBuffer, context.ELEVENLABS_API_KEY, context.VOICE_ID);

      await addMessageToThread(openai, callThread, newMessage);

      let assistantStream = await startNewStreamingRun(openai, callThread, context.OPENAI_ASSISTANT_ID)

      let textBuffer = ""
      const wordPattern = /\b\S+\s+/g
      let results: ToolOutput[] = []
      let loop = false
      do {
        loop = false
        for await (const event of assistantStream) {
          if (event.event === "thread.message.delta" && event.data.delta.content && event.data.delta.content[0].type === "text") {
            const delta = event.data.delta.content[0].text?.value
            if (!delta) continue
            textBuffer += delta
            const match = textBuffer.match(wordPattern)
            if (match?.length) {
              textBuffer = textBuffer.replace(wordPattern, "")
              socket.send(JSON.stringify({ text: match.join("") }));
            }
          } else if (event.event === "thread.message.completed") {
            if (textBuffer !== "") socket.send(JSON.stringify({ text: textBuffer }));
            socket.send(JSON.stringify({ text: "" }));
          } else if (event.event === "thread.run.requires_action" && event.data.required_action?.type === "submit_tool_outputs") {
            const outputs = processToolCalls(event.data.required_action.submit_tool_outputs.tool_calls)
            results = results.concat(outputs)
            assistantStream = await openai.beta.threads.runs.submitToolOutputs(callThread, event.data.id, {
              tool_outputs: outputs.map(output => {
                return {
                  tool_call_id: output.id,
                  output: output.functionOutput.response
                }
              }),
              stream: true
            });
            loop = true
          }
        }
      } while (loop)

      const result = filterResults(results)

      await socketClose
      let audioUrl = Promise.resolve("")
      if (audioBuffer.length) {
        const audioFileKey = `${event.CallSid}:${new Date().getTime()}`
        audioUrl = uploadAudioToS3(context, audioFileKey, Buffer.concat(audioBuffer))
          .then(() => createPresignedUrl(context, audioFileKey))
      }

      return {
        audioUrl,
        ...result
      }
    } catch (error) {
      console.error("Error generating AI response and audio:", error);
      throw error;
    }
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
