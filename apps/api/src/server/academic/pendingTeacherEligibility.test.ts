// @vitest-environment node
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import type { PrismaService } from "../../prisma/prisma.service"
import { PrismaSetupRepository } from "../../modules/dashboard/setup.repository"

// A teacher who has not activated the account yet is assigned and counted like any other.
const TEACHING_RULES = ["server/academic/careerWriteStore.ts", "server/syllabus/inProgressWork.ts", "server/dashboard/setupQueries.ts"]

describe("teaching rules and account activation", () => {
  it.each(TEACHING_RULES)("%s does not require an activated account", (file) => {
    expect(readFileSync(join(process.cwd(), "src", file), "utf8")).not.toContain("correo_verificado_en")
  })

  it("keeps an account that already received notices, which the database does not let anyone delete", () => {
    const store = readFileSync(join(process.cwd(), "src", "server/identity/accountStore.ts"), "utf8")
    const traces = store.slice(store.indexOf("async hasActivity"), store.indexOf("async purgeAccount"))
    expect(traces).toContain(`from "notificaciones"`)
  })

  it("counts a career as having a teacher before the account is activated", async () => {
    const findFirst = vi.fn(async () => ({ asignacion_rol_id: "g" }))
    const repository = new PrismaSetupRepository({ asignaciones_rol: { findFirst } } as unknown as PrismaService)
    expect(await repository.careerHasActiveTeacher("c")).toBe(true)
    expect(findFirst).toHaveBeenCalledWith({
      where: { asignacion_rol_activa: true, rol: "docente", carrera_id: "c", usuarios: { is: { usuario_activo: true } } },
      select: { asignacion_rol_id: true },
    })
  })
})
