import OpenAI from "openai";
import { Run } from "openai/resources/beta/threads/runs/runs";

const openai = new OpenAI({ apiKey: "apiKey" })
const pages = await openai.beta.threads.runs.list("threadID")
let runs: Run[] = []
for await (const page of pages.iterPages()) {
  runs = [...runs, ...page.getPaginatedItems()]
}

const costs = runs
  .map(run => run.usage as Run.Usage)
  .reduce((summation, current) => {
      return {
        prompt_tokens: summation.prompt_tokens + current.prompt_tokens,
        completion_tokens: summation.completion_tokens + current.completion_tokens,
      }
    },
    { prompt_tokens: 0, completion_tokens: 0 }
  )

console.log(costs)
