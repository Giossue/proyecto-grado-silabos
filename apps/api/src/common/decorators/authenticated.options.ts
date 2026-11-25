import type { Type } from "@nestjs/common"
import type { SessionRequirements, SessionUser } from "../../server/auth/types"
import type { SessionRequest } from "../http/session-request"

export const AUTHENTICATED = "silabos:authenticated"

export type RateLimitOptions = { name: string; maxAttempts: number; decaySeconds: number }

export interface SessionPreloader {
  load(request: Request, user: SessionUser, http: SessionRequest): Promise<Response | null>
}

export type AuthenticatedOptions = Omit<SessionRequirements, "afterAuthentication"> & {
  rateLimit?: RateLimitOptions
  preload?: Type<SessionPreloader>
}
