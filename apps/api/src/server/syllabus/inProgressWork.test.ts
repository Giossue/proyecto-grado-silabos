import { describe, expect, it } from "vitest"
import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import { returnApprovals } from "./coordinationHandover"
import { anotherProcessInProgress } from "./finalizedChangeNotice"
import { InProgressWork } from "./inProgressWork"
import { convocationsToReopen, reopenProcess } from "./reopenCatchUp"

const SYLLABUS = "0195e7a0-0000-7000-8000-000000000001"
const CONVOCATION = "0195e7a0-0000-7000-8000-000000000002"
const PARALLEL = "0195e7a0-0000-7000-8000-000000000003"
const CAREER = "0195e7a0-0000-7000-8000-000000000004"
const PERIOD = "0195e7a0-0000-7000-8000-000000000005"
const REVISION = "0195e7a0-0000-7000-8000-000000000006"
const PROCESS = "0195e7a0-0000-7000-8000-000000000007"

type Statement = { kind: "query" | "execute"; text: string }

function recordingDb(reply: (text: string) => unknown[]): { db: Db; statements: Statement[] } {
  const statements: Statement[] = []
  const run = (kind: Statement["kind"]) => async (query: Prisma.Sql) => {
    const text = query.text.replace(/\s+/g, " ").trim()
    statements.push({ kind, text })
    return kind === "execute" ? 1 : reply(text)
  }
  return { db: { $queryRaw: run("query"), $executeRaw: run("execute") } as unknown as Db, statements }
}

const syllabusRow = { id: SYLLABUS, convocation_id: CONVOCATION, parallel_id: PARALLEL, state: "aprobado", context: '{"subject":{"name":"Cálculo"}}', started: true, version: 3 }

function locks(statements: Statement[]): string[] {
  return statements.map((statement) => statement.text).filter((text) => /for (update|share)|SET LOCAL/.test(text))
}

describe("InProgressWork locking", () => {
  it("locks the syllabi in id order when asked", async () => {
    const { db, statements } = recordingDb(() => [syllabusRow])
    const work = new InProgressWork(db, () => {})
    const syllabi = await work.syllabi(Prisma.sql`silabos.silabo_id = ${SYLLABUS}::uuid`, { lock: true, ordered: true })
    expect(syllabi).toEqual([{ id: SYLLABUS, convocationId: CONVOCATION, parallelId: PARALLEL, state: "aprobado", context: { subject: { name: "Cálculo" } }, started: true, version: 3 }])
    expect(statements[0].text).toMatch(/from silabos where silabos\.silabo_id = \$1::uuid order by silabos\.silabo_id asc for update of silabos$/)
  })

  it("regenerates locking syllabi, clearing history, then convocations, parallels and assignments in that order", async () => {
    const { db, statements } = recordingDb((text) => {
      if (text.startsWith("select silabos.silabo_id::text as id, silabos.convocatoria_carrera_id")) return [syllabusRow]
      if (text.includes("from docentes_vigentes_silabo")) return []
      if (text.includes("convocatoria.carrera_id::text as career_id, proceso.periodo_academico_id")) return [{ id: CONVOCATION, career_id: CAREER, period_id: PERIOD }]
      if (text.startsWith("select revision_silabo_id::text as id from revisiones_silabo where silabo_id in")) return []
      if (text.startsWith("select convocatoria_carrera_id::text as id from convocatorias_carreras")) return [{ id: CONVOCATION }]
      if (text.startsWith("select convocatoria.carrera_id::text as career_id")) return [{ career_id: CAREER, period_id: PERIOD }]
      if (text.startsWith("select paralelo.paralelo_id::text as id")) return [{ id: PARALLEL, subject_id: CAREER, code: "A", shift: "matutina", subject: "Cálculo", campus: null, modality: "presencial", teachers: 1 }]
      if (text.startsWith("select silabos.paralelo_id::text as id from silabos where silabos.convocatoria_carrera_id")) return [{ id: PARALLEL }]
      return []
    })
    const work = new InProgressWork(db, () => {})
    expect(await work.regenerate({ careerIds: CAREER })).toEqual({ deleted: 1, generated: 0 })
    const sequence = locks(statements)
    expect(sequence).toHaveLength(5)
    expect(sequence[0]).toMatch(/^select silabos\.silabo_id::text as id, .* from silabos where .*convocatoria_curso\.carrera_id = \$1::uuid.* for update of silabos$/)
    expect(sequence[1]).toBe("SET LOCAL app.reinicio_institucional = 'on'")
    expect(sequence[2]).toMatch(/^select convocatoria_carrera_id::text as id from convocatorias_carreras where convocatoria_carrera_id in \(\$1::uuid\) .* for update$/)
    expect(sequence[3]).toMatch(/^select paralelo\.paralelo_id::text as id, .* order by paralelo\.asignatura_id asc, paralelo\.codigo_paralelo asc for update of paralelo$/)
    expect(sequence[4]).toMatch(/^select asignacion_paralelo_id from asignaciones_paralelo where paralelo_id in \(\$1::uuid\) and asignacion_paralelo_activa = true for update$/)
    const deletes = statements.filter((statement) => statement.kind === "execute").map((statement) => statement.text.split(" where ")[0])
    expect(deletes).toEqual(["SET LOCAL app.reinicio_institucional = 'on'", "delete from firmas_silabo", "delete from notificaciones", "delete from silabos"])
  })

  it("returns decided approvals undoing decisions inside the restart window and deleting files only after commit", async () => {
    const { db, statements } = recordingDb((text) => {
      if (text.startsWith("select revision_silabo_id::text as id from revisiones_silabo")) return [{ id: REVISION }]
      if (text.startsWith("select archivo_pdf_id::text as object_id")) return [{ object_id: null }]
      return []
    })
    const callbacks: Array<() => unknown> = []
    const work = new InProgressWork(db, (callback) => void callbacks.push(callback))
    const returned = await returnApprovals(db, work.afterCommit, CAREER, async () => [
      { id: SYLLABUS, convocationId: CONVOCATION, parallelId: PARALLEL, state: "aprobado", context: {}, started: true, version: 3 },
    ])
    expect(returned).toEqual([SYLLABUS])
    expect(statements.filter((statement) => statement.kind === "execute").map((statement) => statement.text)).toEqual([
      "SET LOCAL app.reinicio_institucional = 'on'",
      "delete from firmas_silabo where silabo_id = $1::uuid and firmado_como = $2",
      "delete from exportaciones_silabo where revision_silabo_id = $1::uuid",
      "delete from aprobaciones where revision_silabo_id = $1::uuid",
      "delete from revisiones_coordinacion where revision_silabo_id = $1::uuid",
      "SET LOCAL app.reinicio_institucional = 'off'",
      "update silabos set estado_silabo = 'en_revision', version_borrador = $1 where silabo_id = $2::uuid",
    ])
    expect(callbacks).toHaveLength(1)
  })

  it("locks the other processes only when asked", async () => {
    const { db, statements } = recordingDb(() => [{ id: PROCESS }])
    expect(await anotherProcessInProgress(db, PROCESS)).toBe(true)
    expect(await anotherProcessInProgress(db, PROCESS, true)).toBe(true)
    expect(statements[0].text).toMatch(/<> \$1::uuid limit 1$/)
    expect(statements[1].text).toMatch(/<> \$1::uuid for update$/)
  })

  it("reopens a process locking its convocations before its syllabi and restoring their states", async () => {
    const { db, statements } = recordingDb((text) => {
      if (text.startsWith("select convocatoria_carrera_id::text as id, estado_previo_cierre_convocatoria_carrera")) return [{ id: CONVOCATION, previous: "abierta" }]
      if (text.startsWith("select convocatoria_carrera_id::text as id from convocatorias_carreras")) return [{ id: CONVOCATION }]
      if (text.startsWith("select silabos.silabo_id::text as id")) return [{ ...syllabusRow, context: '{"closed_document":{}}' }]
      return []
    })
    expect(await convocationsToReopen(db, PROCESS)).toEqual([CONVOCATION])
    expect(await reopenProcess(new InProgressWork(db, () => {}), PROCESS)).toEqual([CONVOCATION])
    const sequence = locks(statements)
    expect(sequence[0]).toMatch(/order by convocatoria_carrera_id asc for update$/)
    expect(sequence[1]).toMatch(/order by convocatoria_carrera_id asc for update$/)
    expect(sequence[2]).toMatch(/order by silabos\.silabo_id asc for update of silabos$/)
    const writes = statements.filter((statement) => statement.kind === "execute").map((statement) => statement.text.split(" set ")[0])
    expect(writes).toEqual(["update silabos", "update convocatorias_carreras", "update convocatorias_universidad"])
  })
})
