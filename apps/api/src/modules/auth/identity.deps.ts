import { Inject, Injectable } from "@nestjs/common"
import { runtimeOf } from "../../server/auth/runtime"
import type { BridgeDeps } from "../../server/auth/types"
import type { RateLimiter } from "../../server/http/throttle"
import type { AccountRepository } from "../../server/identity/accounts"
import type { IdentityWriteDeps } from "../../server/identity/accountWrites"
import type { AuthenticationDeps, CredentialStore } from "../../server/identity/authentication"
import type { RecoveryDeps, RecoveryRepository } from "../../server/identity/passwordRecovery"
import type { ProfileRepository, SessionDeps } from "../../server/identity/session"
import type { ActiveSessionDeps, ActiveSessionStore } from "../../server/identity/sessions"
import type { TwoFactorDeps, TwoFactorStore } from "../../server/identity/twoFactor"
import { AUTH_BRIDGE, RATE_LIMITER } from "./auth.tokens"
import { IDENTITY_RUNTIME, type IdentityRuntime } from "./identity.runtime"
import { ACCOUNT_REPOSITORY, ACTIVE_SESSION_STORE, CREDENTIAL_STORE, PROFILE_REPOSITORY, RECOVERY_REPOSITORY, TWO_FACTOR_STORE } from "./identity.tokens"

export type IdentityStores = {
  profiles: ProfileRepository
  activeSessions: ActiveSessionStore
  credentials: CredentialStore
  recovery: RecoveryRepository
  twoFactor: TwoFactorStore
  accounts: AccountRepository
}

export type IdentityDepsSet = {
  session: SessionDeps
  activeSessions: ActiveSessionDeps
  authentication: AuthenticationDeps
  twoFactor: TwoFactorDeps
  recovery: RecoveryDeps
  writes: IdentityWriteDeps
}

export function identityDepsOf(bridge: BridgeDeps, limiter: RateLimiter, runtime: IdentityRuntime, stores: IdentityStores): IdentityDepsSet {
  const clock = { today: runtime.today, timezone: runtime.timezone }
  return {
    session: { bridge, profiles: stores.profiles, ...clock },
    activeSessions: { bridge, store: stores.activeSessions },
    authentication: {
      bridge,
      auth: runtime.auth,
      credentials: stores.credentials,
      profiles: stores.profiles,
      ...clock,
      throttles: limiter,
      attempts: runtime.attempts,
      verifyPassword: runtime.verifyPassword,
      dummyHash: runtime.dummyHash,
      production: runtime.production,
      pwned: runtime.pwned,
    },
    twoFactor: {
      bridge,
      auth: runtime.auth,
      store: stores.twoFactor,
      replay: runtime.replay,
      throttles: limiter,
      attempts: runtime.attempts,
      verifyPassword: runtime.verifyPassword,
    },
    recovery: {
      runtime: runtimeOf(bridge),
      store: stores.recovery,
      throttles: limiter,
      verifyHash: runtime.verifyPassword,
      hashPassword: runtime.hashPassword,
      timebox: runtime.timebox,
      production: runtime.production,
      pwned: runtime.pwned,
      sendMail: runtime.sendMail,
    },
    writes: {
      bridge,
      accounts: stores.accounts,
      services: runtime.services,
      limiter,
      verifyPassword: runtime.verifyPassword,
      session: { profiles: stores.profiles, ...clock },
    },
  }
}

@Injectable()
export class IdentityDeps {
  readonly set: IdentityDepsSet

  constructor(
    @Inject(AUTH_BRIDGE) bridge: BridgeDeps,
    @Inject(RATE_LIMITER) limiter: RateLimiter,
    @Inject(IDENTITY_RUNTIME) runtime: IdentityRuntime,
    @Inject(PROFILE_REPOSITORY) profiles: ProfileRepository,
    @Inject(ACTIVE_SESSION_STORE) activeSessions: ActiveSessionStore,
    @Inject(CREDENTIAL_STORE) credentials: CredentialStore,
    @Inject(RECOVERY_REPOSITORY) recovery: RecoveryRepository,
    @Inject(TWO_FACTOR_STORE) twoFactor: TwoFactorStore,
    @Inject(ACCOUNT_REPOSITORY) accounts: AccountRepository,
  ) {
    this.set = identityDepsOf(bridge, limiter, runtime, { profiles, activeSessions, credentials, recovery, twoFactor, accounts })
  }
}
