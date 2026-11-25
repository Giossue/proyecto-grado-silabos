import { Inject, Injectable } from "@nestjs/common"
import type { AppSession, BridgeDeps } from "../../server/auth/types"
import type { PhpArray } from "../../server/http/input"
import type { RateLimiter } from "../../server/http/throttle"
import { systemSettingsOf, type SettingsEnvironment } from "../../server/operations/systemSettings"
import { administratorDenial, saveSystemSettings, systemSettingsConnection, type SystemSettingsWriteDeps } from "../../server/operations/systemSettingsWrites"
import { AUTH_BRIDGE, RATE_LIMITER } from "../auth/auth.tokens"
import { SettingsRepository } from "./settings.repository"
import { CONNECTION_FETCH, LIBRARY_DIRECTORY, PASSWORD_VERIFIER, SETTINGS_ENVIRONMENT } from "./settings.tokens"

@Injectable()
export class SettingsService {
  constructor(
    @Inject(SettingsRepository) private readonly settings: SettingsRepository,
    @Inject(AUTH_BRIDGE) private readonly bridge: BridgeDeps,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(SETTINGS_ENVIRONMENT) private readonly environment: () => SettingsEnvironment,
    @Inject(PASSWORD_VERIFIER) private readonly verifyPassword: SystemSettingsWriteDeps["verifyPassword"],
    @Inject(CONNECTION_FETCH) private readonly fetch: SystemSettingsWriteDeps["fetch"],
    @Inject(LIBRARY_DIRECTORY) private readonly libraries: SystemSettingsWriteDeps["libraries"],
  ) {}

  show(): Promise<Response> {
    return systemSettingsOf(this.deps())
  }

  async save(session: AppSession, section: string, input: PhpArray): Promise<Response> {
    return administratorDenial(session) ?? saveSystemSettings(session, section, input, this.deps())
  }

  async test(session: AppSession, section: string): Promise<Response> {
    return administratorDenial(session) ?? systemSettingsConnection(section, this.deps())
  }

  private deps(): SystemSettingsWriteDeps {
    return {
      bridge: this.bridge,
      limiter: this.limiter,
      stored: () => this.settings.stored(),
      environment: this.environment,
      verifyPassword: this.verifyPassword,
      save: (rows, actorId, at) => this.settings.save(rows, actorId, at),
      fetch: this.fetch,
      libraries: this.libraries,
    }
  }
}
