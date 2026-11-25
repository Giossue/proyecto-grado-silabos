import { phpIntCast } from "../configuration/phpValues"
import { fileSource, type FileSource } from "../storage/fileSource"
import { detectMimeType } from "./mimeType"

const JPEG = Buffer.from("ffd8ff", "hex")

function guessedMimeType(bytes: Buffer): string {
  return bytes.subarray(0, 3).equals(JPEG) ? "image/jpeg" : detectMimeType(bytes)
}

function byteRange(request: Request, size: number, lastModified: string): { start: number; end: number } | "unsatisfiable" | null {
  const range = request.headers.get("range")
  if (request.method !== "GET" || range === null || !range.startsWith("bytes=")) return null
  const ifRange = request.headers.get("if-range")
  if (ifRange !== null && ifRange !== lastModified) return null
  const spec = range.slice(6)
  const dash = spec.indexOf("-")
  const from = dash === -1 ? spec : spec.slice(0, dash)
  const to = dash === -1 ? "0" : spec.slice(dash + 1)
  let end = to === "" ? size - 1 : phpIntCast(to)
  let start: number
  if (from === "") {
    start = size - end
    end = size - 1
  } else start = phpIntCast(from)
  if (start > end) return null
  end = Math.min(end, size - 1)
  return start < 0 || start > end ? "unsatisfiable" : { start, end }
}

export async function binaryFileResponse(request: Request, file: string | FileSource, headers: Record<string, string>): Promise<Response> {
  const source = fileSource(file)
  const bytes = await source.read()
  const found = await source.stat()
  if (found === null) throw Object.assign(new Error(`ENOENT: no such file '${source.key}'`), { code: "ENOENT" })
  const lastModified = found.modifiedAt.toUTCString()
  const base: Record<string, string> = {
    ...headers,
    "Content-Type": headers["Content-Type"] ?? guessedMimeType(bytes),
    "Last-Modified": lastModified,
    "Content-Length": String(bytes.length),
    "Accept-Ranges": "bytes",
  }
  const range = byteRange(request, bytes.length, lastModified)
  if (range === "unsatisfiable") return new Response(null, { status: 416, headers: { ...base, "Content-Length": "0", "Content-Range": `bytes */${bytes.length}` } })
  const head = request.method === "HEAD"
  if (range === null) return new Response(head ? null : new Uint8Array(bytes), { status: 200, headers: base })
  const slice = bytes.subarray(range.start, range.end + 1)
  return new Response(new Uint8Array(slice), {
    status: 206,
    headers: { ...base, "Content-Length": String(slice.length), "Content-Range": `bytes ${range.start}-${range.end}/${bytes.length}` },
  })
}
