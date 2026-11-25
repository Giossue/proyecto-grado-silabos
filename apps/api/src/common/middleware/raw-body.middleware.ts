import type { NextFunction, Response } from "express"
import type { ApiRequest } from "../http/web-request"

export const RAW_BODY_LIMIT = 64 * 1024 * 1024

export function rawBodyMiddleware(request: ApiRequest, response: Response, next: NextFunction): void {
  if (request.method === "GET" || request.method === "HEAD") return next()
  const chunks: Buffer[] = []
  let size = 0
  let failed = false
  request.on("data", (chunk: Buffer) => {
    size += chunk.length
    if (size > RAW_BODY_LIMIT && !failed) {
      failed = true
      response.status(413).json({ message: "" })
      request.destroy()
      return
    }
    if (!failed) chunks.push(chunk)
  })
  request.on("end", () => {
    if (failed) return
    request.rawBody = Buffer.concat(chunks)
    next()
  })
  request.on("error", (error) => {
    if (!failed) next(error)
  })
}
