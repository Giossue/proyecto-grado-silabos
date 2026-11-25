import { unmatchedRoute } from "./router"

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>

const BODILESS = ["GET", "HEAD", "OPTIONS"]

async function shape(response: Response) {
  return { status: response.status, allow: response.headers.get("allow"), contentType: response.headers.get("content-type"), body: await response.text() }
}

export function nativeMethods(module: Record<string, unknown>, served: string[], methods: string[]): string[] {
  return methods.filter((method) => !served.includes(method) && !(method === "HEAD" && module.HEAD === undefined && served.includes("GET")))
}

export async function routerComparison(module: Record<string, unknown>, method: string, path: string, params: Record<string, string> = {}) {
  const request = () => new Request(`http://localhost:3000${path}`, { method, body: BODILESS.includes(method) ? undefined : "{}" })
  const handler = module[method] as Handler
  return { next: await shape(await handler(request(), { params: Promise.resolve(params) })), unmatched: await shape(unmatchedRoute(request())) }
}
