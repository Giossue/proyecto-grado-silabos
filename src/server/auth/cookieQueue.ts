import "server-only"
import { cookies } from "next/headers"
import type { OutgoingCookie } from "./types"

type CookieOptions = { expires: Date; maxAge: number; path: string; domain?: string; secure: boolean; httpOnly: boolean; sameSite: "lax" | "strict" | "none" }

export type CookieJar = { set(name: string, value: string, options: CookieOptions): unknown }

function sameSiteOf(value: string): CookieOptions["sameSite"] {
  const lower = value.toLowerCase()
  return lower === "strict" || lower === "none" ? lower : "lax"
}

export function setOnJar(jar: CookieJar, cookie: OutgoingCookie): void {
  jar.set(cookie.name, cookie.value, {
    expires: new Date(cookie.expires * 1000),
    maxAge: cookie.maxAge,
    path: cookie.path,
    ...(cookie.domain === null ? {} : { domain: cookie.domain }),
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: sameSiteOf(cookie.sameSite),
  })
}

export async function queueResponseCookies(outgoing: OutgoingCookie[]): Promise<void> {
  let jar: CookieJar
  try {
    jar = (await cookies()) as unknown as CookieJar
  } catch {
    return
  }
  try {
    for (const cookie of outgoing) setOnJar(jar, cookie)
  } catch {
    return
  }
}
