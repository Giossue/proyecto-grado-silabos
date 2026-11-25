import type { MailApp } from "./templates/MailLayout"

export type MailConfig = {
  mailer: string
  host: string
  port: number
  scheme: string | null
  username: string | null
  password: string | null
  localDomain: string | null
  sendmailPath: string
  from: { address: string; name: string }
  app: MailApp
}

type Env = Record<string, string | undefined>

export function envValue(env: Env, name: string): string | null | undefined {
  const value = env[name]
  if (value === undefined) return undefined
  const lowered = value.toLowerCase()
  if (lowered === "null" || lowered === "(null)") return null
  if (lowered === "empty" || lowered === "(empty)") return ""
  return value
}

function setting(env: Env, name: string, fallback: string): string {
  const value = envValue(env, name)
  return value === undefined || value === null ? fallback : value
}

export function frontendUrl(env: Env = process.env): string {
  return setting(env, "FRONTEND_URL", "http://localhost:5173").split(",")[0].trim()
}

export function mailConfig(env: Env = process.env): MailConfig {
  const appName = setting(env, "APP_NAME", "Sílabos UEB")
  const appUrl = setting(env, "APP_URL", "http://localhost")
  return {
    mailer: setting(env, "MAIL_MAILER", "log"),
    host: setting(env, "MAIL_HOST", "127.0.0.1"),
    port: Number.parseInt(setting(env, "MAIL_PORT", "2525"), 10),
    scheme: envValue(env, "MAIL_SCHEME") ?? null,
    username: envValue(env, "MAIL_USERNAME") ?? null,
    password: envValue(env, "MAIL_PASSWORD") ?? null,
    localDomain: envValue(env, "MAIL_EHLO_DOMAIN") ?? (URL.canParse(appUrl) ? new URL(appUrl).hostname : null),
    sendmailPath: setting(env, "MAIL_SENDMAIL_PATH", "/usr/sbin/sendmail -bs -i"),
    from: { address: setting(env, "MAIL_FROM_ADDRESS", "hello@example.com"), name: setting(env, "MAIL_FROM_NAME", appName) },
    app: { name: appName, frontendUrl: frontendUrl(env), locale: setting(env, "APP_LOCALE", "es") },
  }
}
