import { act, render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Session } from "@/api/session"
import AppEvents from "@/components/AppEvents"
import { clearIntendedRoute, consumeIntendedRoute } from "@/lib/intended-route"
import { handleRoleRequired, handleUnauthorized } from "@/lib/unauthorized"
import { sessionState } from "@/state/session"
import { navigation } from "@/test/nextNavigation"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))

const router = { replace: navigation.replace }

describe("manejo de 401", () => {
  beforeEach(() => {
    sessionState.clear()
    clearIntendedRoute()
  })

  it("no expulsa de una ruta pública cuando nunca hubo sesión", () => {
    navigation.reset("/activar-cuenta?token=abc")

    handleUnauthorized(router)

    expect(navigation.replace).not.toHaveBeenCalled()
    expect(navigation.fullPath).toBe("/activar-cuenta?token=abc")
  })

  it("envía al login cuando una sesión activa caduca", () => {
    navigation.reset("/docente/mis-silabos")
    sessionState.replace({ user: {} } as unknown as Session)

    handleUnauthorized(router)

    expect(navigation.pathname).toBe("/ingresar")
    expect(sessionState.current.value).toBeNull()
    expect(consumeIntendedRoute()).toBe("/docente/mis-silabos")
  })

  it("reacciona al aviso del cliente de la API", () => {
    navigation.reset("/docente/mis-silabos")
    sessionState.replace({ user: {} } as unknown as Session)
    render(<AppEvents />)

    act(() => {
      window.dispatchEvent(new CustomEvent("silabos:unauthorized"))
    })

    expect(navigation.pathname).toBe("/ingresar")
    expect(sessionState.current.value).toBeNull()
  })
})

describe("manejo de sesión sin rol", () => {
  beforeEach(() => sessionState.clear())

  it("no hace nada cuando no hay sesión cargada", () => {
    navigation.reset("/docente/mis-silabos")

    handleRoleRequired(router)

    expect(navigation.pathname).toBe("/docente/mis-silabos")
  })

  it("envía a elegir rol y olvida el rol en memoria", () => {
    navigation.reset("/docente/mis-silabos")
    sessionState.replace({ user: {}, active_role: { id: 1 } } as unknown as Session)

    handleRoleRequired(router)

    expect(navigation.pathname).toBe("/rol")
    expect(sessionState.current.value?.active_role).toBeNull()
  })

  it("reacciona al aviso de rol requerido del cliente de la API", () => {
    navigation.reset("/docente/mis-silabos")
    sessionState.replace({ user: {}, active_role: { id: 1 } } as unknown as Session)
    render(<AppEvents />)

    act(() => {
      window.dispatchEvent(new CustomEvent("silabos:role-required"))
    })

    expect(navigation.pathname).toBe("/rol")
    expect(sessionState.current.value?.active_role).toBeNull()
  })
})
