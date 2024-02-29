import { ServerlessFunctionSignature } from '@twilio-labs/serverless-runtime-types/types';
import { StatusCallbackServerlessEventObject, TwilioEnvironmentVariables } from './types/interfaces';

export const handler: ServerlessFunctionSignature<TwilioEnvironmentVariables, StatusCallbackServerlessEventObject> = function(
  context,
  event,
  callback,
) {
  if (event.CallStatus === "Completed") {
    const callerNumber = event.From
    const logFileName = decodeURIComponent(event.request.cookies.logFileName) // Could be 'null' if the call was terminated too early
    const callStartTimestamp = decodeURIComponent(event.request.cookies.callStartTimestamp)
    const callEndTimestamp = event.Timestamp
    const callDurationInSeconds = event.CallDuration
    // Send into AWS RDS
  }
  const response = new Response();
  return callback(null, response)
}
