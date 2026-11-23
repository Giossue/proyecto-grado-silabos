import http from "node:http"
import https from "node:https"
import { KohaTransportError, type KohaFetch } from "./catalog"

const USER_AGENT = "Silabos-UEB/1.0"

export const kohaFetch: KohaFetch = (url, { accept, settings }) => {
  const target = new URL(url)
  const client = target.protocol === "https:" ? https : target.protocol === "http:" ? http : null
  if (client === null) return Promise.reject(new Error(`Unsupported protocol ${target.protocol}`))
  const limit = Math.max(1, settings.responseBytes)
  return new Promise((resolve, reject) => {
    const timers: NodeJS.Timeout[] = []
    let settled = false
    const settle = (action: () => void) => {
      if (settled) return
      settled = true
      timers.forEach(clearTimeout)
      action()
    }
    const fail = (error: Error) => settle(() => reject(error instanceof KohaTransportError ? error : new KohaTransportError(error.message)))
    const headers: Record<string, string> = { "user-agent": USER_AGENT }
    if (accept) headers.accept = accept
    const request = client.get(target, { headers }, (response) => {
      const announced = Number(response.headers["content-length"] ?? 0)
      if (announced > limit) {
        request.destroy(new KohaTransportError("The transfer was aborted by the progress callback"))
        return
      }
      const chunks: Buffer[] = []
      let received = 0
      response.on("data", (chunk: Buffer) => {
        received += chunk.length
        if (received > limit) {
          request.destroy(new KohaTransportError("The transfer was aborted by the progress callback"))
          return
        }
        chunks.push(chunk)
      })
      response.on("end", () => settle(() => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks) })))
      response.on("error", fail)
      response.on("close", () => fail(new KohaTransportError("The transfer was interrupted")))
    })
    request.on("error", fail)
    request.on("close", () => fail(new KohaTransportError("The connection was closed")))
    if (settings.timeoutSeconds > 0) {
      timers.push(setTimeout(() => request.destroy(new KohaTransportError("Operation timed out")), settings.timeoutSeconds * 1000))
    }
    if (settings.connectTimeoutSeconds > 0) {
      const connect = setTimeout(() => request.destroy(new KohaTransportError("Connection timed out")), settings.connectTimeoutSeconds * 1000)
      timers.push(connect)
      request.on("socket", (socket) => {
        const connected = () => clearTimeout(connect)
        if (!socket.connecting) connected()
        socket.once(target.protocol === "https:" ? "secureConnect" : "connect", connected)
      })
    }
  })
}
