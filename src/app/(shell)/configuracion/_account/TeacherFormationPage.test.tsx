import { fireEvent } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { updateFormation } from "@/api/session"
import TeacherFormationPage from "./TeacherFormationPage"
import { sessionState } from "@/state/session"
import { flush, renderWithProviders } from "@/test/render"

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/session", () => ({ updateProfile: vi.fn(), updateFormation: vi.fn(), resendActivation: vi.fn() }))
vi.mock("@/layouts/settings/Layout", () => ({ SettingsLayout: ({ children }: { children?: ReactNode }) => <div>{children}</div> }))

const sessionFor = (code: "docente" | "administrador", formation: string | null = null) => ({
  user: { id: "u-1", name: "DOCENTE UNO", email: "docente@ueb.edu.ec", email_verified: true, can_edit_identity: code === "administrador", formation },
  active_role: { id: "r-1", code, career_id: null, career_name: null },
  available_roles: [],
})

describe("TeacherFormationPage — formación y experiencia del docente", () => {
  beforeEach(() => {
    vi.mocked(updateFormation).mockReset()
    sessionState.clear()
  })

  it("el docente escribe su formación una vez y el botón espera un cambio", async () => {
    sessionState.replace(sessionFor("docente"))
    vi.mocked(updateFormation).mockResolvedValue(sessionFor("docente", "Ingeniero en Sistemas"))
    const { container } = renderWithProviders(<TeacherFormationPage />)
    const save = container.querySelector<HTMLButtonElement>('[data-test="update-formation-button"]')!
    expect(save.disabled).toBe(true)

    fireEvent.change(container.querySelector("#formation")!, { target: { value: "Ingeniero en Sistemas" } })
    await flush()
    expect(save.disabled).toBe(false)
    fireEvent.submit(container.querySelector("form")!)
    await flush()

    expect(updateFormation).toHaveBeenCalledWith("Ingeniero en Sistemas")
    expect(sessionState.current.value?.user.formation).toBe("Ingeniero en Sistemas")
  })
})
