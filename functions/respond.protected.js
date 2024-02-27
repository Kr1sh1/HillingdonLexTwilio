import OpenAI from "openai";
import { twiml, Response } from 'twilio';

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

export async function handler (context, event, callback) {
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
  const twiml_response = new twiml.VoiceResponse();
  const response = new Response();

  const cookieValue = event.request.cookies.convo;
  const conversation = cookieValue ?
    JSON.parse(decodeURIComponent(cookieValue)) :
    [];

  const userLog = {
    role: "user",
    content: event.SpeechResult,
  };

  conversation.push(userLog);

  const aiResponse = await generateAIResponse(conversation);
  const cleanedAiResponse = aiResponse.replace(/^\w+:\s*/i, "").trim();

  const assistantLog = {
    role: "assistant",
    content: cleanedAiResponse,
  };

  conversation.push(assistantLog);

  let logFileName;
  if (!event.request.cookies.logFileName) {
    const callStartTimestamp = decodeURIComponent(event.request.cookies.callStartTimestamp)
    logFileName = `${event.From || event.phoneNumber}_${callStartTimestamp}.json`
    response.setCookie('logFileName', encodeURIComponent(logFileName), ['Path=/']);
  } else {
    logFileName = decodeURIComponent(event.request.cookies.logFileName)
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

  callback(null, response);

  async function generateAIResponse(conversation) {
    const messages = formatConversation(conversation);
    return await createChatCompletion(messages);
  }

  function formatConversation(conversation) {
    const messages = [{
      role: "system",
      content: "You are a creative, funny, friendly and amusing AI assistant named Joanna. Please provide engaging but concise responses.",
    },
    {
      role: "user",
      content: "We are having a casual conversation over the telephone so please provide engaging but concise responses.",
    },
    ];

    return messages.concat(conversation);
  }

  async function createChatCompletion(messages) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages,
        temperature: 0.8,
        max_tokens: 100,
      });

      if (completion.status === 500) {
        console.error("Error: OpenAI API returned a 500 status code.");
        twiml_response.say({
          voice: "Polly.Joanna-Neural",
        },
          "Oops, looks like I got an error from the OpenAI API on that request. Let's try that again."
        );
        twiml_response.redirect({
          method: "POST",
        },
          `/transcribe`
        );
        response.appendHeader("Content-Type", "application/xml");
        response.setBody(twiml_response.toString());
        callback(null, response);
      }

      return completion.choices[0].message.content;
    } catch (error) {
      if (error.code === "ETIMEDOUT" || error.code === "ESOCKETTIMEDOUT") {
        console.error("Error: OpenAI API request timed out.");
        twiml_response.say({
          voice: "Polly.Joanna-Neural",
        },
          "I'm sorry, but it's taking me a little bit too long to respond. Let's try that again, one more time."
        );
        twiml_response.redirect({
          method: "POST",
        },
          `/transcribe`
        );
        response.appendHeader("Content-Type", "application/xml");
        response.setBody(twiml_response.toString());
        callback(null, response);
      } else {
        console.error("Error during OpenAI API request:", error);
        throw error;
      }
    }
  }

  async function uploadToS3(logs, logFileName) {
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

