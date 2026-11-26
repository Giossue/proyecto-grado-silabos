import type { Redis } from "ioredis"
import type { Db } from "../../prisma/db"
import { frontendUrl } from "../mail/config"
import { queueMail } from "../mail/sendMailJob"
import { environmentSettings, type SettingsEnvironment } from "../operations/systemSettings"
import { redisPrefix } from "../redis/connection"
import { institutionTimezone, systemNow } from "../shared/clock"
import type { DigestDeps } from "./dailyDigest"
import { digestPendingOn } from "./dailyDigestQueries"

const CLAIM_SECONDS = 172_800

/** Unlike the settings screen, a failed read is an error: better no email than one the administrator switched off. */
export function digestSettingsOn(db: Db, environment: SettingsEnvironment = process.env): DigestDeps["settings"] {
  return async () => {
    const rows = await db.$queryRaw<{ clave_ajuste: string; valor_ajuste: unknown }[]>`select clave_ajuste, valor_ajuste from ajustes_sistema`
    const saved = new Map(rows.map((row) => [row.clave_ajuste, row.valor_ajuste]))
    const defaults = environmentSettings(environment)
    const value = (field: string) => (saved.has(field) ? saved.get(field) : defaults[field])
    return { enabled: Boolean(value("notifications.emails")), time: String(value("notifications.digest_time")).trim() }
  }
}

export function digestDepsOn(db: Db, redis: Redis): DigestDeps {
  const keyOf = (key: string) => `${redisPrefix()}${key}`
  return {
    now: systemNow,
    timeZone: institutionTimezone(),
    settings: digestSettingsOn(db),
    pending: (today) => digestPendingOn(db, today),
    claim: async (key) => (await redis.set(keyOf(key), "1", "EX", CLAIM_SECONDS, "NX")) === "OK",
    release: async (key) => void (await redis.del(keyOf(key))),
    finished: async (key) => (await redis.exists(keyOf(key))) === 1,
    finish: async (key) => void (await redis.set(keyOf(key), "1", "EX", CLAIM_SECONDS)),
    mail: queueMail,
    frontendUrl: frontendUrl(),
  }
}
