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

  const openai = ClientManager.getOpenAIClient(context)
  const twiml_response = new Twilio.twiml.VoiceResponse();
  const response = new Twilio.Response();
  const cookies = event.request.cookies;
  const callThread = cookies.threadID;
  const newMessage = event.SpeechResult;
  const voiceId = context.VOICE_ID;
  const model = 'eleven_multilingual_v2';

  await generateAIResponse(newMessage);

  twiml_response.redirect({
    method: "POST",
  },
    `/transcribe`
  );


  response.appendHeader("Content-Type", "application/xml");
  response.setBody(twiml_response.toString());

  return callback(null, response);

  async function sendChunkToElevenLabs(responseChunk : string) {
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
      const audioArrayBuffer = await response.arrayBuffer();
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
        run.on('messageDelta', (delta: any) => {
          voiceResponse(delta.delta.content.map((content: any) => content.text.value).join(''), twiml_response);
        });

        // Wait for the run to complete
        await run.finalMessages();

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



    function voiceResponse(responseChunk: string, twiml_response: any) {
    twiml_response.say({
      voice: "Polly.Joanna-Neural",
    },
      responseChunk
    );
    console.log("Voiced response:", responseChunk);
    }


  async function handleRunStatuses(run: Run) {
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
        break; // Exit the loop if run is not defined or status is not queued or in_progress
      }
    }
  }
}
