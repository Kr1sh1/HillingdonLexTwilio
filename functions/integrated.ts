import { WriteStream, createWriteStream } from 'fs';
import OpenAI from "openai";
import { WebSocket } from "ws"

export const handler = async function () {
  const openai = new OpenAI({ apiKey: "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" });
  const thread = await openai.beta.threads.create();
  const callThread = thread.id;
  const OPENAI_ASSISTANT_ID = "asst_ZmMDKgO6wfYFrZrbfM2xYMpa";
  const apiKey = "4fe5b0c6647091b6a8a448b8f8e6ea11";
  const voiceId = "uKiGb1dv4ftgRlwtw84z";
  const model = "eleven_multilingual_v2";
  const filePath = "new_test.wav";

  const conversationText = "Hello, is this Hillingdon Council?";
  await generateAIResponseAndAudio(conversationText, apiKey, voiceId, model, filePath);

  function initializeWebSocketConnection(outputStream: WriteStream): WebSocket {
    const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input?model_id=${model}`;
    const socket = new WebSocket(wsUrl);
    const bosMessage = {
      "text": " ",
      "voice_settings": {
        "stability": 0.5,
        "similarity_boost": 0.8
      },
      "xi_api_key": apiKey,
    };

    socket.onopen = () => {
      console.log('WebSocket connection opened...');
      // Send the bosMessage when the connection is opened
      socket.send(JSON.stringify(bosMessage));
    };

    socket.onerror = (error) => {
      console.error(`WebSocket Error: ${error.message}`);
      outputStream.close();
    };

    socket.onclose = (event) => {
      if (event.wasClean) {
        console.info(`Connection closed cleanly, code=${event.code}, reason=${event.reason}`);
      } else {
        console.warn('Connection died');
      }
    };

    socket.onmessage = (event) => {
      const response = JSON.parse(event.data.toString());

      console.log("Server responded");

      if (response.audio) {
        const audioChunk = Buffer.from(response.audio, 'base64');
        outputStream.write(audioChunk);
      } else {
        console.log("No audio data in the response");
      }

      if (response.isFinal) {
        outputStream.end();
        socket.close();
      }
    };

    return socket;
  }

  async function sendTextForAudioGeneration(socket: WebSocket, text: string): Promise<void> {
    const message = {
      text,
      "voice_settings": {
        "stability": 0.5,
        "similarity_boost": 0.8
      },
      flush: text === ""
    };
    console.log("send: ", text)
    socket.send(JSON.stringify(message));
  }

  async function generateAIResponseAndAudio(newMessage: string, apiKey: string, voiceId: string, model: string, filePath: string): Promise<void> {
    console.log('Inside generateAIResponseAndAudio function...');
    try {
      const outputStream = createWriteStream(filePath);
      const socket = initializeWebSocketConnection(outputStream);

      await addMessageToThread(newMessage);
      const run = await startNewRun();

      run.on('textDelta', async (textDelta) => {
        console.log(textDelta)
        const responseText = (textDelta.value + " ").trimStart();
        console.log('Received text delta:', responseText);
        // await delay(500);
        await sendTextForAudioGeneration(socket, responseText);
      });

      console.log('Listener 1 Activated');
      await handleRunStatuses(run);
      await run.finalMessages();
      await sendTextForAudioGeneration(socket, "");
    } catch (error) {
      console.error("Error generating AI response and audio:", error);
      throw error;
    }
  }

  async function addMessageToThread(newMessage: string) {
    console.log('Adding message to thread...');
    return await openai.beta.threads.messages.create(callThread, {
      role: "user",
      content: newMessage
    });
  }

  async function startNewRun() {
    console.log('Starting new run...');
    try {
      const run = openai.beta.threads.runs.createAndStream(callThread, {
        assistant_id: OPENAI_ASSISTANT_ID,
      });
      return run;
    } catch (error) {
      console.error("Error starting new run:", error);
      throw error;
    }
  }
  function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function handleRunStatuses(run: any) {
    console.log('Handling run statuses...');
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

handler();
