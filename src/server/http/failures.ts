import { jsonError, serverError } from "./responses"

export class HttpFailure extends Error {
  constructor(readonly response: Response) {
    super(`HTTP ${response.status}`)
  }
}

export function modelNotFoundResponse(model: string, id?: string | readonly string[]): Response {
  const ids = id === undefined ? [] : typeof id === "string" ? [id] : [...id]
  return jsonError(404, `No query results for model [${model}]${ids.length === 0 ? "." : ` ${ids.join(", ")}`}`)
}

export function failModelNotFound(model: string, id?: string | readonly string[]): never {
  throw new HttpFailure(modelNotFoundResponse(model, id))
}

export function failServerError(): never {
  throw new HttpFailure(serverError())
}

export function failAbort(status: number, message = ""): never {
  throw new HttpFailure(jsonError(status, message))
}

export class Missing extends HttpFailure {
  constructor(model: string, id?: string) {
    super(modelNotFoundResponse(model, id))
  }
}

export function reportedServerError(error: unknown): Response {
  console.error(error)
  return serverError()
}
