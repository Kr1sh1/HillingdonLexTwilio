import { ServerlessFunctionSignature } from '@twilio-labs/serverless-runtime-types/types';
import { CommonServerlessEventObject, TwilioEnvironmentVariables } from './types/interfaces';
import { ClientManager } from './helpers/clients';

export const handler: ServerlessFunctionSignature<TwilioEnvironmentVariables, CommonServerlessEventObject> = async function (
  context,
  event,
  callback
) {
  // Create a Twilio Response object
  const response = new Twilio.Response();
  // Create a TwiML Voice Response object to build the response
  const twiml_response = new Twilio.twiml.VoiceResponse();

  // If the call has just started
  if (!event.request.cookies.initiated) {
    // Greet the user with a message using AWS Polly Neural voice
    twiml_response.say({
      voice: 'Polly.Joanna-Neural',
    },
      "Branch dev 2"
    );

    // Initialise OpenAI communication
    const openai = ClientManager.getOpenAIClient(context)
    const callThread = await openai.beta.threads.create();
    const callThreadID = callThread.id;

    const syncClient = ClientManager.getSyncClient(context)
    await syncClient.documents.create({
      uniqueName: event.CallSid + "NotSID",
      data: JSON.stringify({
        threadId: callThreadID
      })
    })

    response.setCookie('initiated', "true", ['Path=/']);
    response.setCookie('threadID', callThreadID, ['Path=/']);
  }

  // Listen to the user's speech and pass the input to the /respond Function
  twiml_response.gather({
    speechTimeout: 'auto', // Automatically determine the end of user speech
    speechModel: 'experimental_conversations', // Use the conversation-based speech recognition model
    input: ['speech'], // Specify speech as the input type
    action: '/respond', // Send the collected input to /respond
    actionOnEmptyResult: true,
  });

  // Set the response content type to XML (TwiML)
  response.appendHeader('Content-Type', 'application/xml');

  // Set the response body to the generated TwiML
  response.setBody(twiml_response.toString());

  // Return the response to Twilio
  return callback(null, response);
}

