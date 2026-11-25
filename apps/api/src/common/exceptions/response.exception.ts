export class ResponseException extends Error {
  constructor(readonly response: Response) {
    super(`HTTP ${response.status}`)
  }
}
