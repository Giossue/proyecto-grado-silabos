import { createHash } from "node:crypto"

export type GotenbergSettings = { url: string; timeoutSeconds: number }
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>

type Env = Record<string, string | undefined>

export function gotenbergSettings(env: Env = process.env): GotenbergSettings {
  const timeout = Number.parseInt(env.GOTENBERG_TIMEOUT ?? "90", 10)
  return { url: (env.GOTENBERG_URL ?? "").replace(/\/+$/, ""), timeoutSeconds: Number.isNaN(timeout) ? 0 : timeout }
}

export function gotenbergEnabled(settings: GotenbergSettings): boolean {
  return settings.url !== ""
}

function pdfDate(generatedAt: string): string {
  const time = Date.parse(generatedAt)
  const moment = new Date(Number.isNaN(time) ? 0 : Math.floor(time / 1000) * 1000)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `D:${moment.getUTCFullYear()}${pad(moment.getUTCMonth() + 1)}${pad(moment.getUTCDate())}${pad(moment.getUTCHours())}${pad(moment.getUTCMinutes())}${pad(moment.getUTCSeconds())}`
}

function fit(hex: string, length: number): string {
  return hex.toUpperCase().repeat(Math.ceil(length / 32) + 1).slice(0, length)
}

export function stabilizePdf(pdf: Buffer, docx: Buffer, generatedAt: string): Buffer {
  const date = pdfDate(generatedAt)
  const dated = pdf
    .toString("latin1")
    .replace(/\/(CreationDate|ModDate)\s*\((D:[0-9]{14}[^)]*)\)/g, (_match, name: string, value: string) => `/${name}(${`${date}Z00'00'`.padEnd(value.length, " ")})`)
  const id = createHash("md5").update(docx).digest("hex")
  const stable = dated.replace(/\/ID\s*\[\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\]/g, (match, first: string, second: string) =>
    match.split(first).join(fit(id, first.length)).split(second).join(fit(id, second.length)),
  )
  return Buffer.from(stable, "latin1")
}

async function convert(content: Buffer, filename: string, settings: GotenbergSettings, fetcher: Fetcher): Promise<Buffer> {
  const form = new FormData()
  form.append("files", new Blob([new Uint8Array(content)]), filename)
  let response: Response
  let body: Buffer
  try {
    response = await fetcher(`${settings.url}/forms/libreoffice/convert`, { method: "POST", body: form, signal: AbortSignal.timeout(settings.timeoutSeconds * 1000) })
    body = Buffer.from(await response.arrayBuffer())
  } catch (error) {
    throw new Error("El servicio de conversión a PDF no respondió.", { cause: error })
  }
  if (!response.ok || !body.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error(`El servicio de conversión a PDF respondió ${response.status}.`)
  return body
}

export async function convertDocx(docx: Buffer, generatedAt: string, settings: GotenbergSettings = gotenbergSettings(), fetcher: Fetcher = fetch): Promise<Buffer> {
  return stabilizePdf(await convert(docx, "silabo.docx", settings, fetcher), docx, generatedAt)
}

export function convertFile(content: Buffer, filename: string, settings: GotenbergSettings = gotenbergSettings(), fetcher: Fetcher = fetch): Promise<Buffer> {
  return convert(content, filename, settings, fetcher)
}
