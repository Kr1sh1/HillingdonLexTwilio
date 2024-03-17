import { Request, TYPES, config, connect } from "mssql"
import { Context, SQLParams } from "../types/types"
import { ClientManager } from "./clients"
import { CallDetails } from "../types/interfaces"

export function constructRequest(request: Request, params: SQLParams) {
  const fieldNames = params.map((param) => param.fieldName)

  const columns = fieldNames.join(", ")
  const values = "@" + fieldNames.join(", @")
  const builtRequest = params.reduce((req, param) => req.input(param.fieldName, param.type, param.value), request)

  return { columns, values, builtRequest }
}

export function makeServerConfig(context: Context) {
  return {
    user: context.RDS_USER,
    password: context.RDS_PASSWORD,
    server: context.RDS_SERVER,
    port: +context.RDS_PORT,
    database: context.RDS_DATABASE,
    options: {
      encrypt: true,
      trustServerCertificate: false
    }
  } as config
}

export function makeSQLParams(callDetails: CallDetails, callSid: string) {
  return [
    {
      fieldName: "callerNumber",
      value: callDetails.from,
      type: TYPES.VarChar
    },
    {
      fieldName: "callStartTimestamp",
      value: callDetails.startTime,
      type: TYPES.DateTime
    },
    {
      fieldName: "callEndTimestamp",
      value: callDetails.endTime,
      type: TYPES.DateTime
    },
    {
      fieldName: "callDurationInSeconds",
      value: callDetails.duration,
      type: TYPES.SmallInt
    },
    {
      fieldName: "logFileName",
      value: `${callSid}.json`,
      type: TYPES.VarChar
    }
  ] as SQLParams
}

export async function uploadCallRecordsToRDS(context: Context, callSid: string) {
  const twilioClient = ClientManager.getTwilioClient(context)
  const callDetailsPromise = twilioClient
    .calls(callSid)
    .fetch()
    .then((call) => {
      const endTime = new Date()
      const duration = Math.ceil((endTime.getTime() - call.startTime.getTime()) / 1000)
      return {
        from: call.from,
        startTime: call.startTime,
        endTime: call.endTime ?? endTime,
        duration: call.endTime ? call.duration : duration,
      } as CallDetails
    })

  const serverConfig = makeServerConfig(context)

  const [pool, callDetails] = await Promise.all([connect(serverConfig), callDetailsPromise])

  const insertParams = makeSQLParams(callDetails, callSid)

  const { columns, values, builtRequest } = constructRequest(pool.request(), insertParams)

  let sqlQuery = `
    INSERT INTO CallRecords (${columns})
    VALUES (${values})
    `

  await builtRequest.query(sqlQuery)
  return pool.close()
}
