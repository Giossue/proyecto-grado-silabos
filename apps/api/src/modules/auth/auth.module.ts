import { Global, Module } from "@nestjs/common"
import { RolesGuard } from "../../common/guards/roles.guard"
import { SessionGuard } from "../../common/guards/session.guard"
import { PrismaModule } from "../../prisma/prisma.module"
import { PrismaService } from "../../prisma/prisma.service"
import { defaultBridgeDeps } from "../../server/auth/requireSession"
import type { SessionStore } from "../../server/auth/types"
import { sharedRateLimiter } from "../../server/http/throttle"
import { createAccountRepository } from "../../server/identity/accountStore"
import { AUTH_BRIDGE, RATE_LIMITER } from "./auth.tokens"
import { AuthenticationController } from "./authentication.controller"
import { IdentityDeps } from "./identity.deps"
import { defaultIdentityRuntime, IDENTITY_RUNTIME } from "./identity.runtime"
import { ACCOUNT_REPOSITORY, ACTIVE_SESSION_STORE, CREDENTIAL_STORE, PROFILE_REPOSITORY, RECOVERY_REPOSITORY, SESSION_STORE, TWO_FACTOR_STORE } from "./identity.tokens"
import { activeSessionStoreOn } from "./repositories/active-sessions.repository"
import { credentialStoreOn } from "./repositories/credentials.repository"
import { profileRepositoryOn } from "./repositories/profile.repository"
import { recoveryRepositoryOn } from "./repositories/recovery.repository"
import { sessionStoreOn } from "./repositories/session-store.repository"
import { twoFactorStoreOn } from "./repositories/two-factor.repository"
import { SessionController } from "./session.controller"

const prismaBacked = <T>(token: symbol, build: (prisma: PrismaService) => T) => ({ provide: token, useFactory: build, inject: [PrismaService] })

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AuthenticationController, SessionController],
  providers: [
    prismaBacked(SESSION_STORE, sessionStoreOn),
    prismaBacked(PROFILE_REPOSITORY, profileRepositoryOn),
    prismaBacked(ACTIVE_SESSION_STORE, activeSessionStoreOn),
    prismaBacked(CREDENTIAL_STORE, credentialStoreOn),
    prismaBacked(RECOVERY_REPOSITORY, recoveryRepositoryOn),
    prismaBacked(TWO_FACTOR_STORE, twoFactorStoreOn),
    { provide: ACCOUNT_REPOSITORY, useFactory: createAccountRepository },
    { provide: AUTH_BRIDGE, useFactory: (store: SessionStore) => ({ ...defaultBridgeDeps(), store }), inject: [SESSION_STORE] },
    { provide: RATE_LIMITER, useFactory: sharedRateLimiter },
    { provide: IDENTITY_RUNTIME, useFactory: defaultIdentityRuntime },
    IdentityDeps,
    SessionGuard,
    RolesGuard,
  ],
  exports: [AUTH_BRIDGE, RATE_LIMITER, IDENTITY_RUNTIME, PROFILE_REPOSITORY, ACCOUNT_REPOSITORY, IdentityDeps, SessionGuard, RolesGuard],
})
export class AuthModule {}
