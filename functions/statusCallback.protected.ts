import { ServerlessFunctionSignature } from '@twilio-labs/serverless-runtime-types/types';
import { InsertParams, StatusCallbackServerlessEventObject, TwilioEnvironmentVariables } from './types/interfaces';
import { connect, config, Request } from 'mssql';
import moment from 'moment';

const constructRequest = (request: Request, params: InsertParams) => {
  const columns = Object.keys(params).join(", ")
  const values = "@" + Object.keys(params).join(", @")
  const builtRequest = Object.entries(params).reduce((req, [key, value]) => req.input(key, value), request)

  return { columns, values, builtRequest }
}

export const handler: ServerlessFunctionSignature<TwilioEnvironmentVariables, StatusCallbackServerlessEventObject> = async function(
  context,
  event,
  callback,
) {
  if (event.CallStatus === "completed") {
    const callerNumber = event.From
    const logFileName = decodeURIComponent(event.request.cookies.logFileName) // Could be 'null' if the call was terminated too early
    const callStartTimestamp = decodeURIComponent(event.request.cookies.callStartTimestamp)
    const callEndTimestamp = moment(event.Timestamp, 'ddd, DD MMM YYYY HH:mm:ss ZZ').format("YYYY-MM-DD HH:mm:ss Z")
    const callDurationInSeconds = event.CallDuration

    const serverConfig: config = {
      user: context.RDS_USER,
      password: context.RDS_PASSWORD,
      server: context.RDS_SERVER,
      port: +context.RDS_PORT,
      database: context.RDS_DATABASE,
      options: {
        encrypt: false,
        trustServerCertificate: false
      }
    };

    const pool = await connect(serverConfig)

    let insertParams: InsertParams = {
      callerNumber,
      callStartTimestamp,
      callEndTimestamp,
      callDurationInSeconds
    }

    if (logFileName !== "null") {
      insertParams = {
        ...insertParams,
        logFileName
      }
    }

    const { columns, values, builtRequest } = constructRequest(pool.request(), insertParams)

    let sqlQuery = `
    INSERT INTO CallRecords (${columns})
    VALUES (${values})
    `

    await builtRequest.query(sqlQuery)
    await pool.close()
  }
  const response = new Response();
  return callback(null, response)
}
