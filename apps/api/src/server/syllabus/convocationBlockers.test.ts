import { describe, expect, it } from "vitest"
import type { CoordinatorReadiness } from "../dashboard/setupChecklist"
import { convocationBlockers } from "../dashboard/setupChecklist"

const ready: CoordinatorReadiness = {
  process: null,
  convocation: null,
  curriculumReady: true,
  scheduledTotal: 2,
  scheduledWithParallels: 2,
  parallelTotal: 2,
  parallelsWithTeacher: 2,
  subjectsWithoutProfile: 0,
  templateReady: true,
  facultyLogoReady: true,
  deadlineOpen: true,
  canOpen: true,
}

describe("convocation blockers", () => {
  it("asks for subjects in a malla that is not closed when the career has none", () => {
    expect(convocationBlockers({ ...ready, curriculumReady: false })).toEqual(["La carrera no tiene materias en la malla vigente. Registre la malla con sus materias."])
  })

  it("does not block for subjects without parallel or parallels without teacher", () => {
    expect(convocationBlockers({ ...ready, scheduledWithParallels: 1, parallelTotal: 3, parallelsWithTeacher: 1 })).toEqual([])
    expect(convocationBlockers(ready)).toEqual([])
  })

  it("asks for at least one parallel with teacher and for the whole career project", () => {
    expect(convocationBlockers({ ...ready, parallelsWithTeacher: 0, subjectsWithoutProfile: 2 })).toEqual([
      "Falta al menos un paralelo con docente.",
      "Falta completar el proyecto de carrera de 2 materias.",
    ])
  })
})
