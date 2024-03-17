import {
  EnvironmentVariables,
  ServerlessEventObject,
} from '@twilio-labs/serverless-runtime-types/types';
import { ISqlType } from 'mssql';
import { AIAction } from './enums';

interface CommonEventBody {
  CallStatus: string;
  From: string;
  CallSid: string;
}

interface RespondEventBody extends CommonEventBody {
  SpeechResult: string;
}

interface StatusCallbackEventBody extends CommonEventBody {
  Timestamp: string;
  CallDuration: string;
  ParentCallSid?: string;
}

interface Cookies {
  initiated: string;
  convo: string;
  threadID: string;
}

export interface CommonServerlessEventObject extends ServerlessEventObject<CommonEventBody, {}, Cookies> {}
export interface RespondServerlessEventObject extends ServerlessEventObject<RespondEventBody, {}, Cookies> {}
export interface StatusCallbackServerlessEventObject extends ServerlessEventObject<StatusCallbackEventBody, {}, {}> {}

export interface TwilioEnvironmentVariables extends EnvironmentVariables {
  OPENAI_API_KEY: string;
  AWS_REGION: string;
  AWS_S3_BUCKET: string;
  AWS_SQS_URL: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  RDS_PASSWORD: string;
  RDS_USER: string;
  RDS_SERVER: string;
  RDS_PORT: string;
  RDS_DATABASE: string;
  ACCOUNT_SID: string;
  AUTH_TOKEN: string;
  OPENAI_ASSISTANT_ID: string;
  SYNC_SERVICE_SID: string;
  ELEVENLABS_API_KEY: string;
  VOICE_ID: string;
}

export interface SQLParam {
  type: ISqlType | (() => ISqlType);
  fieldName: string;
  value: string | number | Date;
}

export interface Tasks {
  [key: string]: any
}

export interface SyncDocumentData {
  threadId: string;
  tasks: Tasks;
  uploaded: boolean;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface AIResponse {
  text: string;
  action: AIAction;
  promises: Promise<any>[];
}

export interface FunctionOutput {
  action: AIAction;
  response: string;
  promises?: Promise<any>[];
}

export interface ToolOutput {
  id: string;
  functionOutput: FunctionOutput;
}

export interface CallDetails {
  from: string;
  startTime: Date;
  endTime: Date;
  duration: number;
}
