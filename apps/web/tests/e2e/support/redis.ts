import net from "node:net"
import { localSetting } from "./db"

const encode = (parts: string[]): string => `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join("")}`

function send(commands: string[][]): Promise<void> {
  const url = new URL(localSetting("REDIS_URL") ?? "redis://127.0.0.1:6379/0")
  const setup: string[][] = []
  if (url.password) setup.push(url.username ? ["AUTH", decodeURIComponent(url.username), decodeURIComponent(url.password)] : ["AUTH", decodeURIComponent(url.password)])
  const database = url.pathname.replace("/", "")
  if (database) setup.push(["SELECT", database])
  const all = [...setup, ...commands]
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: url.hostname, port: Number(url.port || 6379) })
    let received = ""
    socket.setEncoding("utf8")
    socket.on("connect", () => socket.write(all.map(encode).join("")))
    socket.on("data", (chunk: string) => {
      received += chunk
      const lines = received.split("\r\n").filter((line) => /^[+\-:]/.test(line))
      const failure = lines.find((line) => line.startsWith("-") && !line.includes("without any password configured"))
      if (failure) {
        socket.destroy()
        reject(new Error(`Redis refused an E2E command: ${failure.slice(1)}`))
      } else if (lines.length >= all.length) {
        socket.end()
        resolve()
      }
    })
    socket.on("error", reject)
  })
}

export async function clearThrottle(...keys: string[]): Promise<void> {
  const prefix = `${localSetting("REDIS_PREFIX") ?? "silabos-ueb:"}throttle:`
  await send([["DEL", ...keys.flatMap((key) => [`${prefix}${key}`, `${prefix}${key}:timer`])]])
}
