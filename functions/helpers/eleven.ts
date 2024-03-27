import { WebSocket } from 'ws'

export function initializeElevenLabsSocket(audioBuffer: Buffer[], apiKey: string, voiceID: string) {
  const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${voiceID}/stream-input?model_id=eleven_multilingual_v2&output_format=ulaw_8000`;
  const socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('WebSocket connection opened...');
    // Send the bosMessage when the connection is opened
    socket.send(JSON.stringify({
      "text": " ",
      "voice_settings": {
        "stability": 0.5,
        "similarity_boost": 0.8
      },
      "xi_api_key": apiKey,
    }));
  };

  socket.onerror = (error) => {
    console.error(`WebSocket Error: ${error.message}`);
  };

  const socketClose = new Promise((resolve) => {
    socket.onclose = (event) => {
      if (event.wasClean) {
        console.info(`Connection closed cleanly, code=${event.code}, reason=${event.reason}`);
      } else {
        console.warn('Connection died');
      }
      resolve(event)
    };
  })

  socket.onmessage = (event) => {
    const response = JSON.parse(event.data.toString());

    console.log("Server responded");

    if (response.audio) {
      const audioChunk = Buffer.from(response.audio, 'base64');
      audioBuffer.push(audioChunk)
    } else {
      console.log("No audio data in the response");
    }

    if (response.isFinal) {
      socket.close();
    }
  };

  return { socket, socketClose};
}
