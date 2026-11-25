import { randomUUID } from "node:crypto"
import { closeSharedQueues, dispatch } from "./dispatch"
import { platformSmokeJob } from "./jobs/platformSmoke"

async function main(): Promise<void> {
  const option = process.argv.find((argument) => argument.startsWith("--key="))?.slice("--key=".length)
  const key = option ? option : `smoke:${randomUUID()}`
  await dispatch(platformSmokeJob, { key })
  console.info(`Trabajo de verificación ${key} despachado.`)
  await closeSharedQueues()
}

void main()
