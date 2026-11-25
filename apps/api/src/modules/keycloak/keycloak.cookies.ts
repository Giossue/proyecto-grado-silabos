export type CookieAttributes = {
  maxAge?: number
  path?: string
  domain?: string
  httpOnly?: boolean
  secure?: boolean
  sameSite?: string | boolean
}

export function serializeCookie(name: string, value: string, attributes: CookieAttributes): string {
  const parts = [`${name}=${value}`]
  if (attributes.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(attributes.maxAge)}`)
  if (attributes.domain) parts.push(`Domain=${attributes.domain}`)
  parts.push(`Path=${attributes.path ?? "/"}`)
  if (attributes.httpOnly) parts.push("HttpOnly")
  if (attributes.secure) parts.push("Secure")
  if (typeof attributes.sameSite === "string") parts.push(`SameSite=${attributes.sameSite.charAt(0).toUpperCase()}${attributes.sameSite.slice(1).toLowerCase()}`)
  return parts.join("; ")
}

export function cookieValue(header: string | null | undefined, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=")
    if (key === name) return rest.join("=")
  }
  return null
}
