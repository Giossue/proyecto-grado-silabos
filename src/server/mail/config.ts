import type { MailApp } from "./layout"

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

export function laravelEnv(env: Env, name: string): string | null | undefined {
  const value = env[name]
  if (value === undefined) return undefined
  const lowered = value.toLowerCase()
  if (lowered === "null" || lowered === "(null)") return null
  if (lowered === "empty" || lowered === "(empty)") return ""
  return value
}

function setting(env: Env, name: string, fallback: string): string {
  const value = laravelEnv(env, name)
  return value === undefined || value === null ? fallback : value
}

export function frontendUrl(env: Env = process.env): string {
  return setting(env, "FRONTEND_URL", "http://localhost:5173").split(",")[0].trim()
}

export function mailConfig(env: Env = process.env): MailConfig {
  const appName = setting(env, "LARAVEL_APP_NAME", "Laravel")
  const appUrl = setting(env, "APP_URL", "http://localhost")
  return {
    mailer: setting(env, "MAIL_MAILER", "log"),
    host: setting(env, "MAIL_HOST", "127.0.0.1"),
    port: Number.parseInt(setting(env, "MAIL_PORT", "2525"), 10),
    scheme: laravelEnv(env, "MAIL_SCHEME") ?? null,
    username: laravelEnv(env, "MAIL_USERNAME") ?? null,
    password: laravelEnv(env, "MAIL_PASSWORD") ?? null,
    localDomain: laravelEnv(env, "MAIL_EHLO_DOMAIN") ?? (URL.canParse(appUrl) ? new URL(appUrl).hostname : null),
    sendmailPath: setting(env, "MAIL_SENDMAIL_PATH", "/usr/sbin/sendmail -bs -i"),
    from: { address: setting(env, "MAIL_FROM_ADDRESS", "hello@example.com"), name: setting(env, "MAIL_FROM_NAME", appName) },
    app: { name: appName, frontendUrl: frontendUrl(env), locale: setting(env, "LARAVEL_APP_LOCALE", "es") },
  }
}
