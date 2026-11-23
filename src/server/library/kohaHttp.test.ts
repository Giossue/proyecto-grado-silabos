// @vitest-environment node
import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { KohaTransportError, type CatalogSettings } from "./catalog"
import { kohaFetch } from "./kohaHttp"

const settings: CatalogSettings = { driver: "koha", baseUrl: "", connectTimeoutSeconds: 1, timeoutSeconds: 0.3, responseBytes: 2048 }
let server: http.Server
let base: string

beforeAll(async () => {
  server = http.createServer((request, response) => {
    if (request.url === "/echo") {
      response.end(JSON.stringify({ agent: request.headers["user-agent"], accept: request.headers.accept ?? null }))
    } else if (request.url === "/redirect") {
      response.writeHead(302, { location: "/echo" }).end()
    } else if (request.url === "/announced") {
      response.writeHead(200, { "content-length": "4096" }).end("x".repeat(4096))
    } else if (request.url === "/streamed") {
      response.writeHead(200)
      response.write("x".repeat(1500))
      setTimeout(() => response.end("x".repeat(1500)), 20)
    } else if (request.url === "/exact") {
      response.end("x".repeat(2048))
    }
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
})

describe("kohaFetch", () => {
  it("sends Laravel's user agent and the Accept header only when asked", async () => {
    const plain = await kohaFetch(`${base}/echo`, { settings })
    expect(JSON.parse(plain.body.toString())).toEqual({ agent: "Silabos-UEB/1.0", accept: null })
    const json = await kohaFetch(`${base}/echo`, { accept: "application/json", settings })
    expect(JSON.parse(json.body.toString()).accept).toBe("application/json")
  })

  it("does not follow redirects", async () => {
    expect((await kohaFetch(`${base}/redirect`, { settings })).status).toBe(302)
  })

  it("aborts the download once the announced or received size passes the limit", async () => {
    await expect(kohaFetch(`${base}/announced`, { settings })).rejects.toBeInstanceOf(KohaTransportError)
    await expect(kohaFetch(`${base}/streamed`, { settings })).rejects.toBeInstanceOf(KohaTransportError)
    expect((await kohaFetch(`${base}/exact`, { settings })).body.length).toBe(2048)
  })

  it("gives up after the total timeout and on a refused connection", async () => {
    await expect(kohaFetch(`${base}/silent`, { settings })).rejects.toBeInstanceOf(KohaTransportError)
    await expect(kohaFetch("http://127.0.0.1:1/", { settings })).rejects.toBeInstanceOf(KohaTransportError)
  })

  it("rejects a protocol it cannot speak as a non-transport error", async () => {
    const error = await kohaFetch("ftp://koha.test/", { settings }).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(KohaTransportError)
  })
})
