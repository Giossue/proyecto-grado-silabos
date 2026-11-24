import { phpJsonEncode } from "./phpJson"

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
}

function jsonResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache, private", ...(status < 300 ? SECURITY_HEADERS : {}) },
  })
}

export function laravelJson(payload: unknown, status = 200): Response {
  return jsonResponse(phpJsonEncode(payload), status)
}

export function laravelHttpError(status: number, message: string): Response {
  return jsonResponse(phpJsonEncode({ message }, { pretty: true, unescapedSlashes: true }), status)
}

export function serverError(): Response {
  return laravelHttpError(500, "Server Error")
}

export function unauthenticated(): Response {
  return laravelJson({ message: "Unauthenticated." }, 401)
}

export function validationError(errors: Record<string, string[]>): Response {
  const messages = Object.values(errors).flat()
  const extra = messages.length - 1
  const summary = extra > 0 ? `${messages[0]} (y ${extra} ${extra === 1 ? "error más" : "errores más"})` : messages[0]
  return laravelJson({ message: summary, errors }, 422)
}

export const FORBIDDEN_MESSAGE = "No tiene permiso para hacer esto."

export function forbidden(): Response {
  return laravelJson({ message: FORBIDDEN_MESSAGE }, 403)
}

export function aborted(status: number): Response {
  return laravelHttpError(status, "")
}
