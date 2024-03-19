import { ServerlessFunctionSignature } from '@twilio-labs/serverless-runtime-types/types';
import { RespondServerlessEventObject, TwilioEnvironmentVariables } from './types/interfaces';
import { sleep } from "openai/core";
import { Run } from "openai/resources/beta/threads";
import { ClientManager } from "./helpers/clients";


export const handler: ServerlessFunctionSignature<TwilioEnvironmentVariables, RespondServerlessEventObject> = async function (
  context,
  event,
  callback
) {
  if (event.CallStatus !== "in-progress") return callback(null)

  const openai = ClientManager.getOpenAIClient(context);
  const twiml_response = new Twilio.twiml.VoiceResponse();
  const response = new Twilio.Response();
  const cookies = event.request.cookies;
  const callThread = cookies.threadID;
  const newMessage = event.SpeechResult;
  const voiceId = context.VOICE_ID;
  const model = 'eleven_multilingual_v2';
  const audioBuffers: ArrayBuffer[] = [];

  await generateAIResponse(newMessage);

  // Accumulate audio Chunks
  const concatenatedBuffer = audioBuffers.reduce((acc, buffer) => {
    const tmp = new Uint8Array(acc.byteLength + buffer.byteLength);
    tmp.set(new Uint8Array(acc), 0);
    tmp.set(new Uint8Array(buffer), acc.byteLength);
    return tmp.buffer;
  }, new Uint8Array(0).buffer);

  twiml_response.redirect({
      method: "POST",
    },
    `/transcribe`
  );
  response.appendHeader("Content-Type", "application/xml");
  response.setBody(twiml_response.toString());

  return callback(null, response);

  async function sendChunkToElevenLabs(responseChunk: string) {
    const outputFormat = 'ulaw_8000';
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=${outputFormat}&optimize_streaming_latency=3`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': context.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          accept: 'audio/wav',
        },
        body: JSON.stringify({
          model_id: model,
          text: responseChunk,
        }),
      }
    );
    return response;
  }

    async function collectAudioChunks(responseChunk: string) {
      const response = await sendChunkToElevenLabs(responseChunk);
      const audioArrayBuffer = await response.arrayBuffer();
      audioBuffers.push(audioArrayBuffer);
    }

    
    async function addMessageToThread(newMessage: string) {
      return await openai.beta.threads.messages.create(callThread, {
        role: "user",
        content: newMessage
      });
    }

    async function generateAIResponse(newMessage: string) {
      try {
        await addMessageToThread(newMessage);
        const run = await startNewRun();

        // Stream responses and voice each chunk
        run.on('messageDelta', async (delta: any) => {
          const responseText = delta.delta.content.map((content: any) => content.text.value).join('');
          await collectAudioChunks(responseText);
        });

        // Wait for the run to complete
        await run.finalMessages();

        await handleRunStatuses(run);

      } catch (error) {
        console.error("Error generating AI response:", error);
        throw error;
      }
    }

    async function startNewRun() {
      try {
        const run = await openai.beta.threads.runs.createAndStream(callThread, {
          assistant_id: context.OPENAI_ASSISTANT_ID,
        });
        return run;
      } catch (error) {
        console.error("Error starting new run:", error);
        throw error;
      }
    }

    async function handleRunStatuses(run: any) {
      return new Promise<void>((resolve, reject) => {
        run.on('runStepCreated', async (runStep: any) => {
          if (runStep.status === "requires_action" && runStep.required_action) {
            try {
              // Submit tool outputs
              await openai.beta.threads.runs.submitToolOutputs(callThread, run.id, {
                tool_outputs: [
                  {
                    tool_call_id: runStep.required_action.submit_tool_outputs.tool_calls[0].id,
                    output: "true",
                  },
                ],
              });
            } catch (error) {
              reject(error);
            }
          }
        });

        run.on('end', () => {
          // Resolve the promise when the stream ends
          resolve();
        });

        // Handle errors
        run.on('error', (error: any) => {
          reject(error);
        });
      });
    }
  }

