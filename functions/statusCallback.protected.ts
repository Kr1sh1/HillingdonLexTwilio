import { ServerlessFunctionSignature } from '@twilio-labs/serverless-runtime-types/types';
import { StatusCallbackServerlessEventObject, SyncDocumentData, TwilioEnvironmentVariables } from './types/interfaces';
import { ClientManager } from './helpers/clients';
import { uploadConversationToS3, uploadTaskstoSQS } from './helpers/aws';
import { uploadCallRecordsToRDS } from './helpers/database';

export const handler: ServerlessFunctionSignature<TwilioEnvironmentVariables, StatusCallbackServerlessEventObject> = async function (
  context,
  event,
  callback,
) {
  const callSid = event.ParentCallSid ?? event.CallSid

  const response = await ClientManager.getSyncClient(context)
    .documents(callSid + "NotSID")
    .fetch()
    .then(async (doc) => {
      const data: SyncDocumentData = doc.data
      if (data.uploaded) return "Already uploaded data to AWS";

      const S3Upload = uploadConversationToS3(context, callSid, data.threadId)
      const SQSUpload = uploadTaskstoSQS(context, callSid, event.From, data.tasks)
      const RDSUpload = uploadCallRecordsToRDS(context, callSid)

      await Promise.all([S3Upload, SQSUpload, RDSUpload]);
      await doc.update({
        data: {
          ...data,
          uploaded: true,
        }
      })
      return "Uploaded data to AWS"
    })

  return callback(null, response)
}
