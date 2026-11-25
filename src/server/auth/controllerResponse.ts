import { apiJson } from "../http/responses"

const CONTROLLER_HEADERS = [...apiJson(null).headers].filter(([name]) => !["content-type", "cache-control"].includes(name))

export function fromController(response: Response): Response {
  for (const [name, value] of CONTROLLER_HEADERS) response.headers.set(name, value)
  return response
}

export function controllerJson(payload: unknown, status = 200): Response {
  return fromController(apiJson(payload, status))
}

export function emptyResponse(status = 204): Response {
  return fromController(new Response(null, { status, headers: { "Cache-Control": "no-cache, private" } }))
}
