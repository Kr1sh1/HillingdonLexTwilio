import { AIAction } from "../types/enums";
import { RespondServerlessEventObject, SyncDocumentData } from "../types/interfaces";
import { Context, TaskProcessor } from "../types/types";
import { ClientManager } from "./clients";

function makeFunctionOutput(action: AIAction, response: string, promises?: Promise<any>[]) {
  return { action, response, promises }
}

function orderRecyclingBag(parameters: any, context: Context, event: RespondServerlessEventObject) {
  const syncClient = ClientManager.getSyncClient(context)
  const task = syncClient.documents(event.CallSid + "NotSID")
    .fetch()
    .then(doc => {
      const data: SyncDocumentData = doc.data
      return doc.update({
        data: {
          ...data,
          tasks: {
            ...data.tasks,
            orderRecyclingBag: parameters
          }
        }
      })
    })
  return makeFunctionOutput(AIAction.NONE, "success", [task])
}

function terminateCall() {
  return makeFunctionOutput(AIAction.TERMINATE, "success")
}

function transferCall() {
  return makeFunctionOutput(AIAction.TRANSFER, "success")
}

export const taskProcessors: TaskProcessor = {
  "order_recycling_bag": orderRecyclingBag,
  "terminate": terminateCall,
  "transfer": transferCall,
}
