import { Inject, Injectable } from "@nestjs/common"
import type { IdentityImportDeps, IdentityImportStore } from "../../server/identity/imports"
import type { ManagedUserDeps, ManagedUserRepository } from "../../server/identity/managedUsers"
import { IdentityDeps } from "../auth/identity.deps"
import { IDENTITY_RUNTIME, type IdentityRuntime } from "../auth/identity.runtime"

export const MANAGED_USER_REPOSITORY = Symbol("MANAGED_USER_REPOSITORY")
export const IDENTITY_IMPORT_STORE = Symbol("IDENTITY_IMPORT_STORE")

export type UsersDepsSet = { managedUsers: ManagedUserDeps; imports: IdentityImportDeps }

@Injectable()
export class UsersDeps {
  readonly set: UsersDepsSet

  constructor(
    @Inject(IdentityDeps) identity: IdentityDeps,
    @Inject(IDENTITY_RUNTIME) runtime: IdentityRuntime,
    @Inject(MANAGED_USER_REPOSITORY) users: ManagedUserRepository,
    @Inject(IDENTITY_IMPORT_STORE) store: IdentityImportStore,
  ) {
    const writes = identity.set.writes
    this.set = { managedUsers: { bridge: writes.bridge, users }, imports: { ...writes, store, now: runtime.now } }
  }
}
