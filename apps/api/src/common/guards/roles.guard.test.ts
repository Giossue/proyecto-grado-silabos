// @vitest-environment node
import "reflect-metadata"
import type { ExecutionContext } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { describe, expect, it } from "vitest"
import { makeAssignment, makeUser } from "../../server/auth/testing"
import type { AppSession } from "../../server/auth/types"
import { Roles } from "../decorators/roles.decorator"
import { ResponseException } from "../exceptions/response.exception"
import { RolesGuard } from "./roles.guard"

class Screens {
  @Roles("administrador")
  admin() {}

  open() {}
}

function contextFor(handler: () => void, role: string | null): ExecutionContext {
  const appSession = { user: makeUser(), activeRole: role === null ? null : makeAssignment({ role }), eligibleRoles: [], session: { id: "s", token: "s", userId: "u", activeRoleAssignmentId: null, cookies: [] } } satisfies AppSession
  return { getHandler: () => handler, getClass: () => Screens, switchToHttp: () => ({ getRequest: () => ({ appSession }) }) } as unknown as ExecutionContext
}

describe("RolesGuard", () => {
  const guard = new RolesGuard(new Reflector())

  it("lets through the active role the route names and any role on routes without @Roles", () => {
    expect(guard.canActivate(contextFor(Screens.prototype.admin, "administrador"))).toBe(true)
    expect(guard.canActivate(contextFor(Screens.prototype.open, "docente"))).toBe(true)
  })

  it("answers the usual 403 to another active role or to no active role", async () => {
    for (const role of ["docente", null]) {
      let failure: unknown = null
      try {
        guard.canActivate(contextFor(Screens.prototype.admin, role))
      } catch (error) {
        failure = error
      }
      expect(failure).toBeInstanceOf(ResponseException)
      const response = (failure as ResponseException).response
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ message: "No tiene permiso para hacer esto." })
    }
  })
})
