import { Global, Module } from "@nestjs/common"
import { sharedRedis } from "../../server/redis/connection"
import { keycloakSettings, type KeycloakSettings } from "./keycloak.config"
import { KeycloakController } from "./keycloak.controller"
import { keycloakOidc } from "./keycloak.oidc"
import { KeycloakService } from "./keycloak.service"
import { redisKeycloakStore } from "./keycloak.store"
import { KEYCLOAK_OIDC, KEYCLOAK_SETTINGS, KEYCLOAK_STORE } from "./keycloak.tokens"

@Global()
@Module({
  controllers: [KeycloakController],
  providers: [
    { provide: KEYCLOAK_SETTINGS, useFactory: () => keycloakSettings() },
    { provide: KEYCLOAK_OIDC, useFactory: (settings: KeycloakSettings) => (settings.enabled ? keycloakOidc(settings) : null), inject: [KEYCLOAK_SETTINGS] },
    { provide: KEYCLOAK_STORE, useFactory: () => redisKeycloakStore(sharedRedis) },
    KeycloakService,
  ],
  exports: [KeycloakService],
})
export class KeycloakModule {}
