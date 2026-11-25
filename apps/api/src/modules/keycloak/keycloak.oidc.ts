import * as client from "openid-client"
import type { EnabledKeycloakSettings } from "./keycloak.config"

export type KeycloakFlow = { verifier: string; state: string; nonce: string }

export type KeycloakIdentity = { email: string | null; idToken: string | null }

export interface KeycloakOidc {
  authorization(): Promise<{ url: URL; flow: KeycloakFlow }>
  identity(callback: URL, flow: KeycloakFlow): Promise<KeycloakIdentity>
  endSession(idToken: string): Promise<URL>
}

export const SCOPE = "openid email profile"

const emailOf = (claims: Record<string, unknown> | undefined): string | null => {
  if (!claims || claims.email_verified === false) return null
  return typeof claims.email === "string" && claims.email.trim() !== "" ? claims.email : null
}

export function keycloakOidc(settings: EnabledKeycloakSettings): KeycloakOidc {
  let discovered: Promise<client.Configuration> | null = null
  const configuration = () =>
    (discovered ??= client.discovery(settings.issuer, settings.clientId, settings.clientSecret).catch((error: unknown) => {
      discovered = null
      throw error
    }))

  return {
    async authorization() {
      const flow = { verifier: client.randomPKCECodeVerifier(), state: client.randomState(), nonce: client.randomNonce() }
      const url = client.buildAuthorizationUrl(await configuration(), {
        redirect_uri: settings.redirectUri,
        scope: SCOPE,
        code_challenge: await client.calculatePKCECodeChallenge(flow.verifier),
        code_challenge_method: "S256",
        state: flow.state,
        nonce: flow.nonce,
      })
      return { url, flow }
    },
    async identity(callback, flow) {
      const config = await configuration()
      const tokens = await client.authorizationCodeGrant(config, callback, {
        pkceCodeVerifier: flow.verifier,
        expectedState: flow.state,
        expectedNonce: flow.nonce,
        idTokenExpected: true,
      })
      const claims = tokens.claims()
      let email = emailOf(claims)
      if (email === null && claims && claims.email_verified !== false && tokens.access_token) {
        email = emailOf(await client.fetchUserInfo(config, tokens.access_token, claims.sub))
      }
      return { email, idToken: tokens.id_token ?? null }
    },
    async endSession(idToken) {
      return client.buildEndSessionUrl(await configuration(), {
        id_token_hint: idToken,
        post_logout_redirect_uri: settings.postLogoutRedirectUri,
        client_id: settings.clientId,
      })
    },
  }
}
