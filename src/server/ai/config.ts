export type AiConfig = {
  driver: string
  baseUrl: string
  model: string
  apiKey: string
  connectTimeoutSeconds: number
  timeoutSeconds: number
  templateModel: string
  strictTools: boolean
  temperature: number | null
  maxOutputTokens: number
  maxSteps: number
  maxSeconds: number
  maxConsecutiveErrors: number
  retryDelaysMs: number[]
  responseBytes: number
  chatMessageCharacters: number
}

type Env = Record<string, string | undefined>

function laravelEnv(env: Env, name: string): string | boolean | null | undefined {
  const raw = env[name]
  if (raw === undefined) return undefined
  const lowered = raw.toLowerCase()
  if (lowered === "true" || lowered === "(true)") return true
  if (lowered === "false" || lowered === "(false)") return false
  if (lowered === "empty" || lowered === "(empty)") return ""
  if (lowered === "null" || lowered === "(null)") return null
  const quoted = /^"([\s\S]*)"$/.exec(raw) ?? /^'([\s\S]*)'$/.exec(raw)
  return quoted ? quoted[1] : raw
}

function text(value: string | boolean | null | undefined): string {
  if (value === true) return "1"
  if (value === false || value === null || value === undefined) return ""
  return value
}

function integer(value: string | boolean | null | undefined, fallback: number): number {
  if (value === undefined) return fallback
  if (typeof value === "boolean") return value ? 1 : 0
  if (value === null) return 0
  const match = /^[ \t\n\r\v\f]*([+-]?\d+)/.exec(value)
  return match ? Number.parseInt(match[1], 10) : 0
}

function phpBool(value: string | boolean | null | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback
  if (typeof value === "boolean") return value
  if (value === null) return false
  return value !== "" && value !== "0"
}

const NUMERIC = /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[ \t\n\r\v\f]*$/

function temperature(value: string | boolean | null | undefined): number | null {
  if (value === undefined) return 0
  if (typeof value !== "string" || !NUMERIC.test(value)) return null
  return Number(value.trim())
}

export function aiConfig(env: Env = process.env): AiConfig {
  return {
    driver: text(laravelEnv(env, "AI_DRIVER") ?? "disabled"),
    baseUrl: text(laravelEnv(env, "AI_BASE_URL")),
    model: text(laravelEnv(env, "AI_MODEL")),
    apiKey: text(laravelEnv(env, "AI_API_KEY")),
    connectTimeoutSeconds: integer(laravelEnv(env, "AI_CONNECT_TIMEOUT"), 2),
    timeoutSeconds: integer(laravelEnv(env, "AI_TIMEOUT"), 20),
    templateModel: text(laravelEnv(env, "AI_TEMPLATE_MODEL")),
    strictTools: phpBool(laravelEnv(env, "AI_TOOLS_STRICT"), true),
    temperature: temperature(laravelEnv(env, "AI_TEMPERATURE")),
    maxOutputTokens: 8192,
    maxSteps: 8,
    maxSeconds: 120,
    maxConsecutiveErrors: 3,
    retryDelaysMs: [2000, 5000],
    responseBytes: 262144,
    chatMessageCharacters: 4000,
  }
}

function filled(value: string): boolean {
  return value.trim() !== ""
}

export function assistantAvailable(config: AiConfig): boolean {
  const driver = config.driver.trim().toLowerCase()
  if (driver === "baseline") return true
  return driver === "deepseek" && filled(config.baseUrl) && filled(config.templateModel || config.model) && filled(config.apiKey)
}
