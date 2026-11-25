import "server-only"
import { cookies } from "next/headers"
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies"

type CookieJar = { set(name: string, value: string, options: ReturnType<typeof toCookieOptions>): unknown }

export async function queueResponseCookies(setCookies: string[]): Promise<void> {
  if (setCookies.length === 0) return
  let jar: CookieJar
  try {
    jar = (await cookies()) as unknown as CookieJar
  } catch {
    return
  }
  try {
    for (const header of setCookies) {
      for (const [name, attributes] of parseSetCookieHeader(header)) jar.set(name, attributes.value, toCookieOptions(attributes))
    }
  } catch {
    return
  }
}

export function withSetCookies(response: Response, setCookies: string[]): Response {
  for (const header of setCookies) response.headers.append("Set-Cookie", header)
  return response
}
