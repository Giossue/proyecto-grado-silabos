// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import type { PrismaService } from "../../../prisma/prisma.service"
import { AcademicStructurePrismaRepository } from "./academic-structure.repository"

const CAREER = "01a1c5bc-0000-7000-8000-0000000000c1"
const user = (id: string) => ({ id, name: id, email: `${id}@ueb.edu.ec`, verified: true, invited: false })

describe("teacherUsers", () => {
  it("offers active teachers, even before they activate the account, and coordinators never deactivated as teachers", async () => {
    const findMany = vi.fn(async () => [{ usuario_id: "u", nombre_usuario: "Ana", correo_electronico: "ana@ueb.edu.ec" }])
    const repository = new AcademicStructurePrismaRepository({ usuarios: { findMany } } as unknown as PrismaService)

    expect(await repository.teacherUsers(CAREER)).toEqual([{ id: "u", name: "Ana", email: "ana@ueb.edu.ec" }])

    const active = (role: string) => ({ some: { asignacion_rol_activa: true, carrera_id: CAREER, rol: { in: [role] } } })
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          usuario_activo: true,
          OR: [
            { asignaciones_rol: active("docente") },
            { AND: [{ asignaciones_rol: active("coordinador") }, { asignaciones_rol: { none: { carrera_id: CAREER, rol: "docente" } } }] },
          ],
        },
      }),
    )
  })
})

describe("careerTeachers", () => {
  it("keeps deactivated teachers listed as inactive, and any active grant makes the teacher active", async () => {
    const findMany = vi.fn(async () => [
      { usuario_id: "active", asignacion_rol_activa: true },
      { usuario_id: "former", asignacion_rol_activa: false },
      { usuario_id: "back", asignacion_rol_activa: false },
      { usuario_id: "back", asignacion_rol_activa: true },
    ])
    const prisma = { asignaciones_rol: { findMany }, $queryRaw: async () => ["active", "former", "back"].map(user) }

    const teachers = await new AcademicStructurePrismaRepository(prisma as unknown as PrismaService).careerTeachers(CAREER)

    expect(findMany).toHaveBeenCalledWith({
      where: { carrera_id: CAREER, rol: "docente", usuarios: { usuario_activo: true } },
      select: { usuario_id: true, asignacion_rol_activa: true },
    })
    expect(teachers.map((teacher) => [teacher.id, teacher.active])).toEqual([
      ["active", true],
      ["former", false],
      ["back", true],
    ])
  })
})
