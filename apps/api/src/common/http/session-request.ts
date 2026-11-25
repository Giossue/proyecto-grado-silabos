import type { AppSession } from "../../server/auth/types"
import type { Throttle } from "../../server/http/throttle"
import type { ApiRequest } from "./web-request"

export type SessionRequest = ApiRequest & {
  appSession?: AppSession
  rateLimit?: Throttle
  preloaded?: unknown
}
