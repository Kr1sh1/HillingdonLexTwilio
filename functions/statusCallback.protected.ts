import { ServerlessFunctionSignature } from '@twilio-labs/serverless-runtime-types/types';
import { Param, StatusCallbackServerlessEventObject, TwilioEnvironmentVariables } from './types/interfaces';
import { connect, config, Request, TYPES } from 'mssql';
import moment from 'moment';

type Params = Param[]

const constructRequest = (request: Request, params: Params) => {
  const fieldNames = params.map((param) => param.fieldName)

  const columns = fieldNames.join(", ")
  const values = "@" + fieldNames.join(", @")
  const builtRequest = params.reduce((req, param) => req.input(param.fieldName, param.type, param.value), request)

  return { columns, values, builtRequest }
}

export const handler: ServerlessFunctionSignature<TwilioEnvironmentVariables, StatusCallbackServerlessEventObject> = async function(
  context,
  event,
  callback,
) {
  if (event.CallStatus === "completed") {
    const serverConfig: config = {
      user: context.RDS_USER,
      password: context.RDS_PASSWORD,
      server: context.RDS_SERVER,
      port: +context.RDS_PORT,
      database: context.RDS_DATABASE,
      options: {
        encrypt: true,
        trustServerCertificate: false
      }
    };

    let insertParams: Params = [
      {
        fieldName: "callerNumber",
        value: event.From,
        type: TYPES.VarChar(20)
      },
      {
        fieldName: "callStartTimestamp",
        value: decodeURIComponent(event.request.cookies.callStartTimestamp),
        type: TYPES.DateTimeOffset(7)
      },
      {
        fieldName: "callEndTimestamp",
        value: moment(event.Timestamp, 'ddd, DD MMM YYYY HH:mm:ss ZZ').format("YYYY-MM-DD HH:mm:ss Z"),
        type: TYPES.DateTimeOffset(7)
      },
      {
        fieldName: "callDurationInSeconds",
        value: +event.CallDuration,
        type: TYPES.SmallInt()
      }
    ]

    if (event.request.cookies.logFileName) {
      insertParams.push({
        fieldName: "logFileName",
        value: decodeURIComponent(event.request.cookies.logFileName),
        type: TYPES.VarChar(100)
      })
    }

    const pool = await connect(serverConfig)

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
