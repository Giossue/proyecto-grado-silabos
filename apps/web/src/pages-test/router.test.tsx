import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import RouteGuard from "@/components/RouteGuard"
import { clearIntendedRoute, consumeIntendedRoute } from "@/lib/intended-route"
import { matchRoute } from "@/lib/routeTable"
import type { RoleCode } from "@/lib/routes"
import { sessionState } from "@/state/session"
import { navigation } from "@/test/nextNavigation"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))

const session = (code: RoleCode) => {
  const global = code === "administrador" || code === "bibliotecario"
  return {
    user: {
      id: "user-1",
      name: "Persona de prueba",
      email: "persona@example.test",
      email_verified: true,
      can_edit_identity: code === "administrador",
    },
    active_role: { id: `role-${code}`, code, career_id: global ? null : "career-1", career_name: global ? null : "Software" },
    available_roles: [],
  }
}

const settle = async (): Promise<void> => {
  for (let round = 0; round < 4; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

const push = async (href: string): Promise<void> => {
  act(() => {
    navigation.push(href)
  })
  await settle()
}

describe("navegación por ámbito activo", () => {
  beforeEach(async () => {
    navigation.reset("/ingresar")
    sessionState.replace(session("administrador"))
    render(<RouteGuard><p>Contenido</p></RouteGuard>)
    await settle()
  })
  afterEach(() => {
    sessionState.clear()
    clearIntendedRoute()
  })

  it("reconoce la URL canónica de Administración", async () => {
    await push("/admin/usuarios")

    expect(navigation.fullPath).toBe("/admin/usuarios")
    expect(screen.getByText("Contenido")).toBeInTheDocument()
  })

  it("conserva el destino interno al pedir el acceso con redirect", async () => {
    sessionState.clear()
    await push("/ingresar?redirect=/admin/usuarios")

    expect(navigation.pathname).toBe("/ingresar")
    expect(consumeIntendedRoute()).toBe("/admin/usuarios")
  })

  it("no conserva redirecciones externas ni rutas desconocidas", async () => {
    sessionState.clear()
    await push("/ingresar?redirect=https://example.com")
    expect(consumeIntendedRoute()).toBeNull()

    await push("/ingresar?redirect=/ruta-desconocida")
    expect(consumeIntendedRoute()).toBeNull()
  })

  it("envía la raíz pública al acceso", async () => {
    sessionState.clear()
    await push("/")

    expect(navigation.pathname).toBe("/ingresar")
  })

  it("resuelve la dirección corta del panel al área activa", async () => {
    sessionState.replace(session("coordinador"))
    await push("/panel")

    expect(navigation.fullPath).toBe("/coordinacion/revisiones")
  })

  it("resuelve la configuración genérica del monolito al área activa", async () => {
    sessionState.replace(session("docente"))
    await push("/configuracion/perfil")

    expect(navigation.fullPath).toBe("/docente/configuracion/perfil")
  })

  it("conserva el destino hasta que se elige un ámbito", async () => {
    sessionState.replace({ ...session("docente"), active_role: null })
    await push("/coordinacion/revisiones/revision-1")

    expect(navigation.fullPath).toBe("/rol")
    expect(consumeIntendedRoute()).toBe("/coordinacion/revisiones/revision-1")
  })

  it("recupera una URL administrativa del historial según el rol real", async () => {
    sessionState.replace(session("docente"))
    await push("/admin/usuarios")

    expect(navigation.fullPath).toBe("/docente/mis-silabos")
  })

  it("no deja una ruta desconocida en blanco", async () => {
    await push("/esta-ruta-no-existe")

    expect(matchRoute(navigation.pathname).record.meta.title).toBe("Página no encontrada")
    expect(navigation.fullPath).toBe("/esta-ruta-no-existe")
    expect(screen.getByText("Contenido")).toBeInTheDocument()
  })

  it.each(["/admin/auditoria", "/admin/reportes"])("deja %s como página no encontrada para Administración", async (path) => {
    await push(path)

    expect(matchRoute(navigation.pathname).record.meta.title).toBe("Página no encontrada")
    expect(navigation.fullPath).toBe(path)
    expect(screen.getByText("Contenido")).toBeInTheDocument()
  })

  it("envía un acceso profundo sin sesión al login con destino interno", async () => {
    sessionState.clear()
    await push("/admin/usuarios")

    expect(navigation.pathname).toBe("/ingresar")
    expect(navigation.fullPath).not.toContain("redirect")
    expect(consumeIntendedRoute()).toBe("/admin/usuarios")
  })

  it("no muestra la pantalla protegida mientras redirige", async () => {
    sessionState.clear()
    navigation.replace.mockImplementationOnce(() => undefined)
    await push("/admin/usuarios")

    expect(navigation.replace).toHaveBeenCalledWith("/ingresar")
    expect(screen.queryByText("Contenido")).toBeNull()
  })

  it.each([
    ["administrador", "/admin/usuarios", "/admin/usuarios"],
    ["coordinador", "/coordinacion/malla", "/coordinacion/malla"],
    ["coordinador", "/coordinacion/proyecto-carrera", "/coordinacion/proyecto-carrera"],
    ["docente", "/docente/mis-silabos", "/docente/mis-silabos"],
    ["bibliotecario", "/biblioteca/revisiones", "/biblioteca/revisiones"],
    ["bibliotecario", "/biblioteca/revisiones/revision-1", "/biblioteca/revisiones/revision-1"],
  ] as const)("permite la ruta propia de %s y conserva sus parámetros", async (code, target, expected) => {
    sessionState.replace(session(code))
    await push(`${target}?pagina=2&orden=asc`)

    expect(navigation.fullPath).toBe(`${expected}?pagina=2&orden=asc`)
  })

  it.each([
    ["administrador", "/coordinacion/malla", "/admin/periodos"],
    ["coordinador", "/admin/usuarios", "/coordinacion/revisiones"],
    ["docente", "/admin/plantilla", "/docente/mis-silabos"],
    ["docente", "/biblioteca/revisiones", "/docente/mis-silabos"],
    ["bibliotecario", "/coordinacion/revisiones", "/biblioteca/revisiones"],
  ] as const)("redirige una ruta de otro rol al panel de %s", async (code, target, expected) => {
    sessionState.replace(session(code))
    await push(target)

    expect(navigation.fullPath).toBe(expected)
  })

  it.each([
    ["/panel", "/biblioteca/revisiones"],
    ["/notificaciones", "/biblioteca/notificaciones"],
    ["/configuracion/seguridad", "/biblioteca/configuracion/seguridad"],
    ["/revisiones/revision-1/documentos", "/biblioteca/revisiones/revision-1"],
  ])("resuelve el atajo %s al área de Biblioteca", async (target, expected) => {
    sessionState.replace(session("bibliotecario"))
    await push(target)

    expect(navigation.fullPath).toBe(expected)
  })

  it("lleva a Biblioteca directo a su bandeja al entrar", async () => {
    sessionState.replace(session("bibliotecario"))
    await push("/rol")
    await push("/ingresar")

    expect(navigation.fullPath).toBe("/biblioteca/revisiones")
  })

  it("no entra en bucle con un rol que la SPA aún no conoce", async () => {
    sessionState.replace(session("rol_futuro" as RoleCode))
    await push("/admin/usuarios")

    expect(navigation.fullPath).toBe("/rol")
  })

  it("envía a verificar el correo y conserva el destino", async () => {
    sessionState.replace({ ...session("docente"), user: { ...session("docente").user, email_verified: false } })
    await push("/docente/mis-silabos")

    expect(navigation.fullPath).toBe("/verificar-correo")
    expect(consumeIntendedRoute()).toBe("/docente/mis-silabos")
  })

  it("con el correo verificado no deja abrir la verificación", async () => {
    sessionState.replace(session("docente"))
    await push("/verificar-correo")

    expect(navigation.fullPath).toBe("/docente/mis-silabos")
  })

  it("resuelve los atajos conservando la consulta", async () => {
    sessionState.replace(session("docente"))
    await push("/notificaciones?pagina=2")

    expect(navigation.fullPath).toBe("/docente/notificaciones?pagina=2")
  })

  it("lleva las direcciones antiguas del rol a su pantalla", async () => {
    await push("/admin/panel")

    expect(navigation.fullPath).toBe("/admin/periodos")
  })
})
