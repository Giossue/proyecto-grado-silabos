import "server-only"
import { sql } from "drizzle-orm"
import { defineJob } from "../job"

export const platformSmokeJob = defineJob<{ key: string }>({
  name: "PlatformSmokeJob",
  queue: "critica",
  tries: 3,
  timeout: 30,
  backoff: [1, 5, 15],
  uniqueId: (data) => data.key,
  runsOnce: true,
  async handle(data) {
    const { db } = await import("@/db")
    await db.execute(sql`select 1`)
    console.info(JSON.stringify({ message: "platform-smoke-ok", key: data.key }))
  },
  failed(_data, error) {
    console.error(error)
  },
})
