import { existsSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { Session } from "@/api/session"
import { mainNavItemsFor } from "@/composables/useMainNavItems"
import { matchRoute, NOT_FOUND_PATH } from "@/lib/routeTable"
import { routeRegistry } from "@/lib/routes"
import { screenTours } from "@/lib/screenTours"

const REMOVED = ["/admin/auditoria", "/admin/reportes"]

const administrator = {
  user: { id: "user-1", name: "Persona de prueba", email: "persona@example.test", email_verified: true, can_edit_identity: true },
  active_role: { id: "role-administrador", code: "administrador", career_id: null, career_name: null },
  available_roles: [],
} as unknown as Session

const appPage = (path: string): string => join("src", "app", "(shell)", ...path.split("/").filter(Boolean), "page.tsx")

describe("Auditoría y Reportes ya no forman parte del sistema", () => {
  it("el menú de Administración no muestra Auditoría ni Reportes", () => {
    const items = mainNavItemsFor(administrator)

    expect(items.map((item) => item.title)).toEqual(["Facultades y carreras", "Usuarios y roles", "Plantilla", "Periodos académicos"])
    expect(items.map((item) => item.href)).not.toEqual(expect.arrayContaining(REMOVED))
  })

  it.each(REMOVED)("%s queda como página no encontrada", (path) => {
    expect(matchRoute(path).record.path).toBe(NOT_FOUND_PATH)
    expect(matchRoute(path).record.meta.title).toBe("Página no encontrada")
    expect(routeRegistry.some((route) => route.path === path)).toBe(false)
    expect(screenTours[path]).toBeUndefined()
    expect(existsSync(appPage(path))).toBe(false)
  })

  it("las demás pantallas de Administración siguen existiendo", () => {
    for (const path of ["/admin/periodos", "/admin/usuarios", "/admin/estructura-academica", "/admin/plantilla", "/admin/configuracion/sistema"]) {
      expect(matchRoute(path).record.path, path).toBe(path)
      expect(existsSync(appPage(path)), path).toBe(true)
    }
  })
})
