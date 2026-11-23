import { fireEvent } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ManagedUserDialog } from "@/components/domain/identity/ManagedUserDialog"
import { flush, renderWithProviders } from "@/test/render"

const { createCareerTeacher } = vi.hoisted(() => ({ createCareerTeacher: vi.fn() }))
vi.mock("@/api/career-academics", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api/career-academics")>()), createCareerTeacher }))

const teacherCareer = { id: "career-1", name: "Software" }

describe("ManagedUserDialog", () => {
  it("no solicita ni muestra una contraseña al crear la cuenta", async () => {
    renderWithProviders(<ManagedUserDialog open teacherCareer={teacherCareer} />)
    await flush()

    expect(document.querySelector("#managed-user-password")).toBeNull()
  })

  it("pide nombres y apellidos del docente, los dos obligatorios", async () => {
    renderWithProviders(<ManagedUserDialog open teacherCareer={teacherCareer} />)
    await flush()

    for (const part of ["nombres", "apellidos"]) {
      expect(document.querySelector(`#managed-user-${part}`)?.getAttribute("aria-required")).toBe("true")
    }
    expect(document.querySelector("#managed-user-name")).toBeNull()
  })

  it("también pide nombres y apellidos en el alta de cuentas de Administración", async () => {
    renderWithProviders(<ManagedUserDialog open />)
    await flush()

    for (const part of ["nombres", "apellidos"]) {
      expect(document.querySelector(`#managed-user-${part}`)?.getAttribute("aria-required")).toBe("true")
    }
    expect(document.querySelector("#managed-user-name")).toBeNull()
  })

  it("en Administración el rol inicial propuesto es Coordinador", async () => {
    const roles = [
      { codigo: "coordinador", nombre: "Coordinador" },
      { codigo: "docente", nombre: "Docente" },
      { codigo: "bibliotecario", nombre: "Bibliotecario" },
    ]
    renderWithProviders(<ManagedUserDialog open roles={roles} careers={[]} />)
    await flush()

    expect(document.querySelector("#managed-user-role")?.textContent).toContain("Coordinador")
    expect(document.querySelector("#managed-user-career")).not.toBeNull()
  })

  it("revisa nombres y apellidos antes de enviar y manda los dos campos en mayúsculas", async () => {
    createCareerTeacher.mockResolvedValue({ message: "Docente creado" })
    renderWithProviders(<ManagedUserDialog open teacherCareer={teacherCareer} />)
    await flush()
    const type = async (id: string, value: string) => {
      fireEvent.change(document.querySelector<HTMLInputElement>(`#managed-user-${id}`)!, { target: { value } })
      await flush()
    }
    const submit = async () => {
      fireEvent.submit(document.querySelector<HTMLFormElement>('[role="dialog"] form')!)
      await flush()
    }

    await type("nombres", "ana 2")
    await type("email", "ana@ueb.edu.ec")
    await submit()
    expect(createCareerTeacher).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("Los nombres solo admiten letras, espacios, apóstrofo y guion")
    expect(document.body.textContent).toContain("Los apellidos son obligatorios")

    await type("nombres", "maría  josé")
    await type("apellidos", "de la cruz-o'neil")
    await submit()
    expect(createCareerTeacher).toHaveBeenCalledWith({ nombres: "MARÍA JOSÉ", apellidos: "DE LA CRUZ-O'NEIL", correo_electronico: "ana@ueb.edu.ec" })
  })
})
