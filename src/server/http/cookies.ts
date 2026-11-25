import "server-only"
import { createHmac } from "node:crypto"

export function cookiePrefix(cookieName: string, key: Buffer): string {
  return createHmac("sha1", key).update(cookieName + "v2").digest("hex") + "|"
}

export function stripValidCookiePrefix(cookieName: string, value: string, key: Buffer): string | null {
  return value.startsWith(cookiePrefix(cookieName, key)) ? value.slice(41) : null
}

export function removeCookiePrefix(value: string): string {
  return value.slice(41)
}

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function parseCookieHeader(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>()
  if (!header) return cookies
  for (const part of header.split(";")) {
    const separator = part.indexOf("=")
    if (separator < 0) continue
    const name = part.slice(0, separator).trim()
    if (name === "" || cookies.has(name)) continue
    cookies.set(name, decodeCookieValue(part.slice(separator + 1).trim()))
  }
  return cookies
}
