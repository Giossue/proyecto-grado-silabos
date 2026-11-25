const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
}

export function apiJson(payload: unknown, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-cache, private", ...(status < 300 ? SECURITY_HEADERS : {}) },
  })
}

export function jsonError(status: number, message: string): Response {
  return apiJson({ message }, status)
}

export function serverError(): Response {
  return jsonError(500, "Server Error")
}

export function unauthenticated(): Response {
  return apiJson({ message: "Unauthenticated." }, 401)
}

export function validationError(errors: Record<string, string[]>): Response {
  const messages = Object.values(errors).flat()
  const extra = messages.length - 1
  const summary = extra > 0 ? `${messages[0]} (y ${extra} ${extra === 1 ? "error más" : "errores más"})` : messages[0]
  return apiJson({ message: summary, errors }, 422)
}

export const FORBIDDEN_MESSAGE = "No tiene permiso para hacer esto."

export function forbidden(): Response {
  return apiJson({ message: FORBIDDEN_MESSAGE }, 403)
}

export function aborted(status: number): Response {
  return jsonError(status, "")
}
