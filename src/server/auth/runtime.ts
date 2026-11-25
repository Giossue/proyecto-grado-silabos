import "server-only"
import { randomBytes } from "node:crypto"
import type { BridgeDeps } from "./types"

export type AuthRuntime = Pick<BridgeDeps, "config" | "now"> & { random: (length: number) => string }

export function runtimeOf(bridge: Pick<BridgeDeps, "config" | "now">): AuthRuntime {
  return { config: bridge.config, now: bridge.now, random: sessionRandom }
}

export function sessionRandom(length: number): string {
  let result = ""
  while (result.length < length) {
    const size = length - result.length
    result += randomBytes(Math.ceil(size / 3) * 3)
      .toString("base64")
      .replace(/[/+=]/g, "")
      .slice(0, size)
  }
  return result
}

export function phpArrayCast(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(phpArrayCast)
  if (typeof value !== "object" || value === null) return value
  const entries = Object.entries(value)
  if (entries.every(([key], index) => key === String(index))) return entries.map(([, item]) => phpArrayCast(item))
  return Object.fromEntries(entries.map(([key, item]) => [key, phpArrayCast(item)]))
}

const DEFAULT_TRUSTED_PROXIES = "127.0.0.1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"

function ipv4Number(ip: string): number | null {
  const parts = ip.split(".")
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null
  return parts.reduce((total, part) => total * 256 + Number(part), 0)
}

function matchesProxy(ip: string, proxy: string): boolean {
  const [network, bits] = proxy.split("/")
  if (bits === undefined) return ip === network
  const address = ipv4Number(ip)
  const base = ipv4Number(network)
  const size = Number(bits)
  if (address === null || base === null || !Number.isInteger(size) || size < 0 || size > 32) return false
  const block = 2 ** (32 - size)
  return Math.floor(address / block) === Math.floor(base / block)
}

export function clientIp(request: Request, trusted: string = process.env.TRUSTED_PROXIES ?? DEFAULT_TRUSTED_PROXIES): string | null {
  const proxies = trusted.split(",").map((proxy) => proxy.trim()).filter((proxy) => proxy !== "")
  const forwarded = (request.headers.get("x-forwarded-for") ?? "").split(",").map((ip) => ip.trim()).filter((ip) => ip !== "")
  const untrusted = forwarded.filter((ip) => !proxies.some((proxy) => matchesProxy(ip, proxy)))
  return untrusted.at(-1) ?? forwarded[0] ?? null
}
