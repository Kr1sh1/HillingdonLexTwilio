import { Context as Context_ } from "@twilio-labs/serverless-runtime-types/types";
import { Message, RespondServerlessEventObject, SQLParam, TwilioEnvironmentVariables, functionOutput } from "./interfaces";

export type SQLParams = SQLParam[]
export type Conversation = Message[];
export type Context = Context_<TwilioEnvironmentVariables>;
export type TaskProcessor = { [key: string]: (parameters: any, context: Context, event: RespondServerlessEventObject) => functionOutput }
