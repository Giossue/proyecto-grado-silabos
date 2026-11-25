import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { ReadableStream as NodeReadableStream } from "node:stream/web"
import type { Response as ExpressResponse } from "express"

export async function sendWebResponse(target: ExpressResponse, response: Response): Promise<void> {
  target.status(response.status)
  response.headers.forEach((value, name) => {
    if (name !== "set-cookie") target.setHeader(name, value)
  })
  for (const cookie of response.headers.getSetCookie()) target.append("Set-Cookie", cookie)
  if (response.body === null) {
    target.end()
    return
  }
  try {
    await pipeline(Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>), target)
  } catch {
    if (!target.destroyed) target.destroy()
  }
}
