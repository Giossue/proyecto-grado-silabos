import type { AttemptLimiter } from "../../server/auth/attemptLimiter"
import { bcryptHash, bcryptVerify } from "../../server/auth/bcrypt"
import { sharedAuth, type Auth } from "../../server/auth/betterAuth"
import { sessionRandom } from "../../server/auth/runtime"
import { redisReplayGuard, type TotpReplayGuard } from "../../server/auth/totp"
import { institutionToday } from "../../server/shared/clock"
import type { AccountServices } from "../../server/identity/accounts"
import { randomString } from "../../server/identity/accountRules"
import { timebox, type Timebox } from "../../server/identity/passwordRecovery"
import { lazyAttemptLimiter } from "../../server/identity/twoFactor"
import { frontendUrl } from "../../server/mail/config"
import type { QueuedMail } from "../../server/mail/mailables"
import { sharedMailer } from "../../server/mail/mailer"
import { queueMail } from "../../server/mail/sendMailJob"
import { sharedRedis } from "../../server/redis/connection"

export const IDENTITY_RUNTIME = Symbol("IDENTITY_RUNTIME")

export type IdentityRuntime = {
  auth: () => Auth
  attempts: AttemptLimiter
  replay: TotpReplayGuard
  verifyPassword: (plain: string, hash: string) => Promise<boolean | null>
  hashPassword: (plain: string) => Promise<string>
  dummyHash: () => Promise<string>
  production: () => boolean
  pwned?: (prefix: string) => Promise<string>
  today: () => string
  timezone: () => string
  timebox: Timebox
  sendMail: (mail: QueuedMail) => Promise<unknown>
  services: AccountServices
  now: () => number
}

const bcryptCost = () => Number.parseInt(process.env.BCRYPT_ROUNDS ?? "12", 10)

let dummy: Promise<string> | null = null

export function defaultIdentityRuntime(): IdentityRuntime {
  const hashPassword = (plain: string) => bcryptHash(plain, bcryptCost())
  return {
    auth: sharedAuth,
    attempts: lazyAttemptLimiter(),
    replay: redisReplayGuard(sharedRedis),
    verifyPassword: bcryptVerify,
    hashPassword,
    dummyHash: () => (dummy ??= bcryptHash(sessionRandom(40), bcryptCost())),
    production: () => process.env.APP_ENV === "production",
    today: institutionToday,
    timezone: () => process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil",
    timebox: timebox(200),
    sendMail: (mail) => sharedMailer().send(mail),
    services: { random: randomString, hashPassword, frontendUrl: () => frontendUrl(), queueMail },
    now: () => Math.floor(Date.now() / 1000),
  }
}
