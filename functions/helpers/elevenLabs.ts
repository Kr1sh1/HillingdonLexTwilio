import axios from "axios";
import { Context } from "../types/types";

export async function getAudioFromText(text: string, context: Context) {
  const body = {
    model_id: "eleven_multilingual_v2",
    text,
    voice_settings: {
      "stability": 0.5,
      "similarity_boost": 0.8
    }
  }

  const headers = {
    Accept: "audio/mpeg",
    'xi-api-key': context.ELEVENLABS_API_KEY,
    'Content-Type': 'application/json'
  }

  const resp = await axios.post(`https://api.elevenlabs.io/v1/text-to-speech/${context.VOICE_ID}?output_format=ulaw_8000`, body, {
    headers,
    responseType: 'arraybuffer'
  })
  return Buffer.from(resp.data, "binary");
}
