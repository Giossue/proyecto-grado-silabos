import { AsyncLocalStorage } from "node:async_hooks"

const queued = new AsyncLocalStorage<string[]>()

export function withCookieQueue<T>(work: () => Promise<T>): Promise<{ result: T; cookies: string[] }> {
  const cookies: string[] = []
  return queued.run(cookies, async () => ({ result: await work(), cookies }))
}

export async function queueResponseCookies(setCookies: string[]): Promise<void> {
  if (setCookies.length === 0) return
  queued.getStore()?.push(...setCookies)
}

export function withSetCookies(response: Response, setCookies: string[]): Response {
  for (const header of setCookies) response.headers.append("Set-Cookie", header)
  return response
}
