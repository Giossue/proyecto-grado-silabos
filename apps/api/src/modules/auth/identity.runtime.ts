import { lazyAttemptLimiter, type AttemptLimiter } from "../../server/auth/attemptLimiter"
import { bcryptHash, bcryptVerify } from "../../server/auth/bcrypt"
import type { PrismaService } from "../../prisma/prisma.service"
import { bindAuthDatabase, sharedAuth, type Auth } from "../../server/auth/betterAuth"
import { sessionRandom } from "../../server/auth/runtime"
import { institutionToday } from "../../server/shared/clock"
import type { AccountServices } from "../../server/identity/accounts"
import { randomString } from "../../server/identity/accountRules"
import { timebox, type Timebox } from "../../server/identity/passwordRecovery"
import { frontendUrl } from "../../server/mail/config"
import type { QueuedMail } from "../../server/mail/mailables"
import { sharedMailer } from "../../server/mail/mailer"
import { queueMail } from "../../server/mail/sendMailJob"

export const IDENTITY_RUNTIME = Symbol("IDENTITY_RUNTIME")

export type IdentityRuntime = {
  auth: () => Auth
  attempts: AttemptLimiter
  verifyPassword: (plain: string, hash: string) => Promise<boolean | null>
  hashPassword: (plain: string) => Promise<string>
  dummyHash: () => Promise<string>
  production: () => boolean
  today: () => string
  timezone: () => string
  timebox: Timebox
  sendMail: (mail: QueuedMail) => Promise<unknown>
  services: AccountServices
  now: () => number
}

const bcryptCost = () => Number.parseInt(process.env.BCRYPT_ROUNDS ?? "12", 10)

let dummy: Promise<string> | null = null

export function defaultIdentityRuntime(prisma: PrismaService): IdentityRuntime {
  bindAuthDatabase(prisma)
  const hashPassword = (plain: string) => bcryptHash(plain, bcryptCost())
  return {
    auth: sharedAuth,
    attempts: lazyAttemptLimiter(),
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
