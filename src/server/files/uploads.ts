import { apiJson } from "../http/responses"
import { requestInput, phpQuery, type PhpArray } from "../http/input"

export type UploadedFile = { originalName: string; clientMimeType: string; bytes: Buffer }

export type MultipartInput = { input: PhpArray; files: Record<string, UploadedFile | null> }

export const POST_TOO_LARGE_MESSAGE = "El archivo es demasiado grande."

export function phpIniBytes(value: string): number {
  const trimmed = value.trim()
  if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) return Math.trunc(Number(trimmed))
  const number = Number.parseInt(trimmed, 10) || 0
  const metric = trimmed.slice(-1).toUpperCase()
  if (metric === "K") return number * 1024
  if (metric === "M") return number * 1_048_576
  if (metric === "G") return number * 1_073_741_824
  return number
}

export function postMaxSize(env: Record<string, string | undefined> = process.env): number {
  return phpIniBytes(env.POST_MAX_SIZE ?? "32M")
}

export function postTooLarge(request: Request, max: number = postMaxSize()): Response | null {
  const length = request.headers.get("content-length")
  if (max <= 0 || length === null || !/^\d+$/.test(length.trim())) return null
  return Number(length.trim()) > max ? apiJson({ message: POST_TOO_LARGE_MESSAGE }, 413) : null
}

export function isMultipart(request: Request): boolean {
  return (request.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")
}

export function clientBasename(name: string): string {
  const normalized = name.replace(/\\/g, "/")
  const position = normalized.lastIndexOf("/")
  return position < 0 ? normalized : normalized.slice(position + 1)
}

export function clientExtension(name: string): string {
  const base = clientBasename(name)
  const dot = base.lastIndexOf(".")
  return dot < 0 ? "" : base.slice(dot + 1)
}

function isFile(value: FormDataEntryValue): value is File {
  return typeof value !== "string"
}

export async function multipartInput(request: Request): Promise<MultipartInput> {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return { input: phpQuery(new URL(request.url)), files: {} }
  }
  const text = new URLSearchParams()
  const files: Record<string, UploadedFile | null> = {}
  for (const [name, value] of form.entries()) {
    if (!isFile(value)) {
      text.append(name, value)
      continue
    }
    if (name.includes("[")) continue
    files[name] = value.name === "" ? null : { originalName: clientBasename(value.name), clientMimeType: value.type, bytes: Buffer.from(await value.arrayBuffer()) }
  }
  const query = phpQuery(new URL(request.url))
  const body = phpQuery(new URL(`http://localhost/?${text.toString()}`))
  const input: PhpArray = { ...body }
  for (const [key, value] of Object.entries(query)) if (!(key in input)) input[key] = value
  for (const name of Object.keys(files)) delete input[name]
  return { input, files }
}

export async function requestBody(request: Request): Promise<MultipartInput> {
  if (isMultipart(request) && request.method === "POST") return multipartInput(request)
  return { input: await requestInput(request), files: {} }
}

export function fileSizeKilobytes(file: UploadedFile): number {
  return file.bytes.length / 1024
}

export async function spoofedMethod(request: Request): Promise<string> {
  const header = request.headers.get("x-http-method-override")
  if (header) return header.toUpperCase()
  const query = new URL(request.url).searchParams.get("_method")
  let value: unknown = null
  if (isMultipart(request) || (request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    try {
      value = (await request.clone().formData()).get("_method")
    } catch {
      value = null
    }
  } else if ((request.headers.get("content-type") ?? "").includes("json")) {
    try {
      value = (JSON.parse(await request.clone().text()) as Record<string, unknown> | null)?._method ?? null
    } catch {
      value = null
    }
  }
  const method = typeof value === "string" ? value : query
  return typeof method === "string" ? method.toUpperCase() : "POST"
}
