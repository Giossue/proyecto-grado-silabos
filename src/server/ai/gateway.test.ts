// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"
import { aiConfig, type AiConfig } from "./config"
import { AiContractException, AiProviderError, BUSY, gatewayFor, hostedGateway, INVALID_KEY, NO_BALANCE, REJECTED, UNAVAILABLE, type AiAgentRequest, type AiMessage, type HttpDeps } from "./gateway"

const BETA = "https://api.deepseek.com/beta/chat/completions"

type Sent = { url: string; headers: Record<string, string>; body: string }

let env: Record<string, string | undefined>
let sent: Sent[]
let slept: number[]
let responses: Map<string, (Response | (() => Response))[]>

beforeEach(() => {
  env = { AI_DRIVER: "deepseek", AI_BASE_URL: "https://api.deepseek.com", AI_MODEL: "deepseek-flash", AI_API_KEY: "secret-test-key" }
  sent = []
  slept = []
  responses = new Map()
})

function fake(url: string, ...items: (Response | (() => Response))[]): void {
  responses.set(url, items)
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

const http: HttpDeps = {
  fetch: async (url, init) => {
    sent.push({ url, headers: Object.fromEntries(new Headers(init.headers).entries()), body: String(init.body) })
    const queue = responses.get(url)
    if (queue === undefined || queue.length === 0) return new Response("", { status: 200 })
    const next = queue.length > 1 ? queue.shift() : queue[0]
    return typeof next === "function" ? next() : (next as Response).clone()
  },
  sleep: async (milliseconds) => {
    slept.push(milliseconds)
  },
}

function config(): AiConfig {
  return aiConfig(env)
}

function request(messages: AiMessage[] = [{ role: "user", content: "Pedido" }]): AiAgentRequest {
  return {
    system: "Reglas",
    messages,
    tools: [{ name: "ver_campo", description: "Muestra un campo.", parameters: { type: "object", properties: { clave: { type: "string" } }, required: ["clave"], additionalProperties: false } }],
    userTag: "adm-prueba",
  }
}

function toolAnswer(name: string, args: string): Response {
  return json({
    choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", function: { name, arguments: args } }] }, finish_reason: "tool_calls" }],
    usage: { prompt_tokens: 1200, completion_tokens: 40, prompt_cache_hit_tokens: 1000 },
  })
}

function body(index = 0): Record<string, unknown> {
  return JSON.parse(sent[index].body) as Record<string, unknown>
}

async function providerError(reason: string): Promise<void> {
  const error = await gatewayFor(config(), http)
    .step(request())
    .then(() => null)
    .catch((caught: unknown) => caught)
  expect(error).toBeInstanceOf(AiProviderError)
  expect((error as AiProviderError).reason).toBe(reason)
}

describe("hosted AI gateway", () => {
  it("sends strict tools to the beta endpoint with a required tool and no thinking", async () => {
    fake(BETA, toolAnswer("ver_campo", '{"clave":"descripcion"}'))

    const step = await gatewayFor(config(), http).step(request())

    expect(step.gatewayVersion).toBe("deepseek:deepseek-flash")
    expect(step.toolCalls[0].name).toBe("ver_campo")
    expect(step.toolCalls[0].arguments).toEqual({ clave: "descripcion" })
    expect(step.usage).toEqual({ prompt: 1200, completion: 40, cached: 1000 })
    const data = body()
    expect(sent[0].url).toBe(BETA)
    expect(sent[0].headers.authorization).toBe("Bearer secret-test-key")
    expect(data.model).toBe("deepseek-flash")
    expect(data.tool_choice).toBe("required")
    expect(data.thinking).toEqual({ type: "disabled" })
    expect(data.user_id).toBe("adm-prueba")
    expect((data.messages as unknown[])[0]).toEqual({ role: "system", content: "Reglas" })
    const tool = (data.tools as Record<string, Record<string, unknown>>[])[0]
    expect(tool.type).toBe("function")
    expect(tool.function.name).toBe("ver_campo")
    expect(tool.function.strict).toBe(true)
    expect((tool.function.parameters as Record<string, unknown>).additionalProperties).toBe(false)
  })

  it("sends the configured temperature without reasoning", async () => {
    env.AI_TEMPERATURE = "0.3"
    fake(BETA, toolAnswer("ver_plantilla", "{}"))

    await gatewayFor(config(), http).step(request())

    expect(body().temperature).toBe(0.3)
    expect(body().thinking).toEqual({ type: "disabled" })
  })

  it("uses a deterministic default temperature", async () => {
    expect(config().temperature).toBe(0)
    fake(BETA, toolAnswer("ver_plantilla", "{}"))

    await gatewayFor(config(), http).step(request())

    expect(sent[0].body).toContain('"temperature":0,')
  })

  it("leaves the provider default with a blank temperature", async () => {
    env.AI_TEMPERATURE = ""
    fake(BETA, toolAnswer("ver_plantilla", "{}"))

    await gatewayFor(config(), http).step(request())

    expect(Object.keys(body())).not.toContain("temperature")
  })

  it("lets the template model override the chat model", async () => {
    env.AI_TEMPLATE_MODEL = "deepseek-v4-pro"
    fake(BETA, toolAnswer("ver_plantilla", "{}"))

    const step = await gatewayFor(config(), http).step(request())

    expect(step.gatewayVersion).toBe("deepseek:deepseek-v4-pro")
    expect(body().model).toBe("deepseek-v4-pro")
  })

  it("uses the configured endpoint without strict mode", async () => {
    env.AI_TOOLS_STRICT = "false"
    env.AI_BASE_URL = "https://api.deepseek.com/chat/completions"
    fake("https://api.deepseek.com/chat/completions", toolAnswer("ver_plantilla", "{}"))

    await gatewayFor(config(), http).step(request())

    expect(sent[0].url).toBe("https://api.deepseek.com/chat/completions")
    expect(Object.keys((body().tools as Record<string, Record<string, unknown>>[])[0].function)).not.toContain("strict")
  })

  it("carries tool calls and their results in the history", async () => {
    fake(BETA, toolAnswer("responder", '{"mensaje":"Listo"}'))

    await gatewayFor(config(), http).step(
      request([
        { role: "user", content: "Pedido" },
        { role: "assistant", content: null, tool_calls: [{ id: "call-1", name: "ver_plantilla", arguments: {}, rawArguments: "{}" }] },
        { role: "tool", tool_call_id: "call-1", content: '{"secciones":[]}' },
      ]),
    )

    const messages = body().messages as unknown[]
    expect(messages[1]).toEqual({ role: "user", content: "Pedido" })
    expect(messages[2]).toEqual({ role: "assistant", content: "", tool_calls: [{ id: "call-1", type: "function", function: { name: "ver_plantilla", arguments: "{}" } }] })
    expect(messages[3]).toEqual({ role: "tool", tool_call_id: "call-1", content: '{"secciones":[]}' })
  })

  it("does not retry insufficient balance and invalid keys", async () => {
    fake(BETA, json({ error: { message: "Insufficient Balance" } }, 402), json([], 401))

    await providerError(NO_BALANCE)
    await providerError(INVALID_KEY)
    expect(sent).toHaveLength(2)
  })

  it("retries a busy provider after waiting", async () => {
    fake(BETA, json([], 429), json([], 503), toolAnswer("ver_plantilla", "{}"))

    const step = await gatewayFor(config(), http).step(request())

    expect(step.toolCalls[0].name).toBe("ver_plantilla")
    expect(sent).toHaveLength(3)
    expect(slept).toEqual([2000, 5000])
  })

  it("gives up on server errors after the retries", async () => {
    fake(BETA, json([], 503))

    await providerError(UNAVAILABLE)
    expect(sent).toHaveLength(3)
  })

  it("keeps the provider detail of a rejected request", async () => {
    fake(BETA, json({ error: { message: "Invalid tool schema" } }, 400))

    const error = (await gatewayFor(config(), http)
      .step(request())
      .catch((caught: unknown) => caught)) as AiProviderError

    expect(error).toBeInstanceOf(AiProviderError)
    expect(error.reason).toBe(REJECTED)
    expect(error.message).toContain("Invalid tool schema")
    expect(sent).toHaveLength(1)
  })

  it("breaks the contract with blank and cut answers", async () => {
    fake(
      BETA,
      json({ choices: [{ message: { content: "   " }, finish_reason: "stop" }] }),
      json({ choices: [{ message: { content: "Lista incompleta" }, finish_reason: "length" }] }),
    )

    for (const reason of ["en blanco", "cortada"]) {
      const error = await gatewayFor(config(), http)
        .step(request())
        .catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(AiContractException)
      expect((error as Error).message).toContain(reason)
    }
  })

  it("counts no capacity as busy", async () => {
    fake(BETA, json({ choices: [{ message: { content: null }, finish_reason: "insufficient_system_resource" }] }))

    await providerError(BUSY)
  })

  it("keeps invalid arguments raw for the assistant", async () => {
    fake(BETA, toolAnswer("ver_campo", '{"clave":'))

    const step = await gatewayFor(config(), http).step(request())

    expect(step.toolCalls[0].arguments).toBeNull()
    expect(step.toolCalls[0].rawArguments).toBe('{"clave":')
  })

  it("only supports DeepSeek", async () => {
    env.AI_DRIVER = "openai"

    await providerError(UNAVAILABLE)
    expect(sent).toEqual([])
    await expect(hostedGateway({ ...config(), driver: "openai" }, http).step(request())).rejects.toThrow("El asistente de la plantilla solo funciona con DeepSeek.")
  })
})
