import OpenAI from "openai";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { ServerlessFunctionSignature } from '@twilio-labs/serverless-runtime-types/types';
import { RespondServerlessEventObject, TwilioEnvironmentVariables } from './types/interfaces';

enum Role {
  SYSTEM = "system",
  ASSISTANT = "assistant",
  USER = "user",
}

interface Message {
  role: Role;
  content: string;
}

type Conversation = Message[];

export const handler: ServerlessFunctionSignature<TwilioEnvironmentVariables, RespondServerlessEventObject> = async function(
  context,
  event,
  callback
) {
  const openai = new OpenAI({ apiKey: context.OPENAI_API_KEY });
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
  const conversation: Conversation = cookies.convo ?
    JSON.parse(decodeURIComponent(cookies.convo)) :
    [];

  const userLog = {
    role: Role.USER,
    content: event.SpeechResult,
  };

  conversation.push(userLog);

  const aiResponse = await generateAIResponse(conversation);
  if (!aiResponse) return;
  const cleanedAiResponse = aiResponse.replace(/^\w+:\s*/i, "").trim();

  const assistantLog = {
    role: Role.ASSISTANT,
    content: cleanedAiResponse,
  };

  conversation.push(assistantLog);

  let logFileName;
  if (!cookies.logFileName) {
    const callStartTimestamp = decodeURIComponent(cookies.callStartTimestamp)
    logFileName = `${event.From}_${callStartTimestamp}.json`
    response.setCookie('logFileName', encodeURIComponent(logFileName), ['Path=/']);
  } else {
    logFileName = decodeURIComponent(cookies.logFileName)
  }

  await uploadToS3([userLog, assistantLog], logFileName);

  while (conversation.length > 10) {
    conversation.shift();
  }

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

  const newCookieValue = encodeURIComponent(
    JSON.stringify(conversation)
  );
  response.setCookie("convo", newCookieValue, ["Path=/"]);

  return callback(null, response);

  async function generateAIResponse(conversation: Conversation) {
    const messages = formatConversation(conversation);
    return await createChatCompletion(messages);
  }

  function formatConversation(conversation: Conversation) {
    const messages = [{
      role: Role.SYSTEM,
      content: "You are a creative, funny, friendly and amusing AI assistant named Joanna. Please provide engaging but concise responses.",
    },
    {
      role: Role.USER,
      content: "We are having a casual conversation over the telephone so please provide engaging but concise responses.",
    },
    ];

    return messages.concat(conversation);
  }

  async function createChatCompletion(messages: Conversation) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages,
        temperature: 0.8,
        max_tokens: 100,
      });

      return completion.choices[0].message.content;
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        console.error("Error: OpenAI API request errored out.");
        twiml_response.say({
          voice: "Polly.Joanna-Neural",
        },
          "I'm sorry, something went wrong. Let's try that again, one more time."
        );
        twiml_response.redirect({
          method: "POST",
        },
          `/transcribe`
        );
        response.appendHeader("Content-Type", "application/xml");
        response.setBody(twiml_response.toString());
        return callback(null, response);
      } else {
        console.error("Error during OpenAI API request:", error);
        throw error;
      }
    }
  }

  async function uploadToS3(logs: Conversation, logFileName: string) {
    const bucketName = 'engelbartchatlogs1';

    const existingContent = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: logFileName,
      })
    )
      .then((response) => response.Body?.transformToString())
      .catch((error) => {
        if (error.Code != "NoSuchKey") throw error;
        console.log(`Creating ${logFileName} for the first time`);
      })
      .then((string) => string ? JSON.parse(string) : [])

    // Push the ammended JSON file onto S3, overwriting the previous one if it existed.
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: logFileName,
        Body: JSON.stringify([...existingContent, ...logs]),
      })
    );
  }
}

