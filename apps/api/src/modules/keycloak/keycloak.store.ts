import type { Redis } from "ioredis"
import { redisPrefix } from "../../server/redis/connection"
import type { KeycloakFlow } from "./keycloak.oidc"

export interface KeycloakStore {
  putFlow(id: string, flow: KeycloakFlow, seconds: number): Promise<void>
  takeFlow(id: string): Promise<KeycloakFlow | null>
  putLogout(sessionId: string, idToken: string, seconds: number): Promise<void>
  takeLogout(sessionId: string): Promise<string | null>
}

const isFlow = (value: unknown): value is KeycloakFlow =>
  typeof value === "object" && value !== null && ["verifier", "state", "nonce"].every((key) => typeof (value as Record<string, unknown>)[key] === "string")

export function redisKeycloakStore(redis: () => Redis, prefix: string = redisPrefix()): KeycloakStore {
  const flowKey = (id: string) => `${prefix}keycloak:flow:${id}`
  const logoutKey = (sessionId: string) => `${prefix}keycloak:logout:${sessionId}`
  const take = async (key: string): Promise<string | null> => {
    const results = await redis().multi().get(key).del(key).exec()
    const value = results?.[0]?.[1]
    return typeof value === "string" ? value : null
  }
  return {
    async putFlow(id, flow, seconds) {
      await redis().set(flowKey(id), JSON.stringify(flow), "EX", seconds)
    },
    async takeFlow(id) {
      const value = await take(flowKey(id))
      if (value === null) return null
      try {
        const flow: unknown = JSON.parse(value)
        return isFlow(flow) ? flow : null
      } catch {
        return null
      }
    },
    async putLogout(sessionId, idToken, seconds) {
      await redis().set(logoutKey(sessionId), idToken, "EX", seconds)
    },
    takeLogout: (sessionId) => take(logoutKey(sessionId)),
  }
}
