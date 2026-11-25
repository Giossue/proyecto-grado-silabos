import { sql } from "drizzle-orm"
import { storageWriter } from "../http/storageWriter"
import { uuidList } from "../http/sql"
import type { AfterCommit } from "../queue/dispatch"
import type { WorkSyllabus } from "./inProgressWork"
import { rowsOf, type Executor } from "./teacherSyllabusQueries"

const ROLE_COORDINATION = "coordinacion"

export type DecidedHandover = { syllabus: WorkSyllabus; revisionId: string }

async function coordinationActed(executor: Executor, syllabus: WorkSyllabus, revisionId: string): Promise<boolean> {
  if (syllabus.state === "aprobado") return true
  const [row] = await rowsOf<{ acted: boolean }>(
    executor,
    sql`select exists (select 1 from aprobaciones where revision_silabo_id = ${revisionId}::uuid)
        or exists (select 1 from revisiones_coordinacion where revision_silabo_id = ${revisionId}::uuid)
        or exists (select 1 from firmas_silabo where silabo_id = ${syllabus.id}::uuid and firmado_como = ${ROLE_COORDINATION}) as acted`,
  )
  return row?.acted === true
}

export async function decidedHandovers(executor: Executor, syllabi: WorkSyllabus[]): Promise<DecidedHandover[]> {
  const decided: DecidedHandover[] = []
  for (const syllabus of syllabi) {
    if (!["en_revision", "aprobado"].includes(syllabus.state)) continue
    const [revision] = await rowsOf<{ id: string }>(
      executor,
      sql`select revision_silabo_id::text as id from revisiones_silabo where silabo_id = ${syllabus.id}::uuid
        and exists (select 1 from silabos where silabos.silabo_id = revisiones_silabo.silabo_id) order by numero_revision desc limit 1`,
    )
    if (revision && (await coordinationActed(executor, syllabus, revision.id))) decided.push({ syllabus, revisionId: revision.id })
  }
  return decided
}

async function undoDecisions(executor: Executor, afterCommit: AfterCommit, syllabusId: string, revisionId: string): Promise<void> {
  await executor.execute(sql`SET LOCAL app.reinicio_institucional = 'on'`)
  const exports = await rowsOf<{ object_id: string | null }>(
    executor,
    sql`select archivo_pdf_id::text as object_id from exportaciones_silabo where revision_silabo_id = ${revisionId}::uuid`,
  )
  const objectIds = [...new Set(exports.map((row) => row.object_id).filter((id): id is string => id !== null && id !== ""))]
  const objects =
    objectIds.length === 0
      ? []
      : await rowsOf<{ disk: string; path: string }>(executor, sql`select disco as disk, ruta_archivo as path from archivos where archivo_id in (${uuidList(objectIds)})`)
  await executor.execute(sql`delete from firmas_silabo where silabo_id = ${syllabusId}::uuid and firmado_como = ${ROLE_COORDINATION}`)
  await executor.execute(sql`delete from exportaciones_silabo where revision_silabo_id = ${revisionId}::uuid`)
  if (objectIds.length > 0) await executor.execute(sql`delete from archivos where archivo_id in (${uuidList(objectIds)})`)
  await executor.execute(sql`delete from aprobaciones where revision_silabo_id = ${revisionId}::uuid`)
  await executor.execute(sql`delete from revisiones_coordinacion where revision_silabo_id = ${revisionId}::uuid`)
  await executor.execute(sql`SET LOCAL app.reinicio_institucional = 'off'`)
  afterCommit(async () => {
    for (const object of objects) {
      try {
        await storageWriter().delete(object.disk, object.path)
      } catch {}
    }
  })
}

export async function returnApprovals(executor: Executor, afterCommit: AfterCommit, careerId: string, load: (where: ReturnType<typeof sql>) => Promise<WorkSyllabus[]>): Promise<string[]> {
  const syllabi = await load(sql`silabos.estado_silabo in ('en_revision', 'aprobado') and exists (select 1 from convocatorias_carreras convocatoria
    where convocatoria.convocatoria_carrera_id = silabos.convocatoria_carrera_id and convocatoria.carrera_id = ${careerId}::uuid
      and convocatoria.estado_convocatoria_carrera != 'cerrada'
      and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id))`)
  const returned: string[] = []
  for (const { syllabus, revisionId } of await decidedHandovers(executor, syllabi)) {
    await undoDecisions(executor, afterCommit, syllabus.id, revisionId)
    await executor.execute(sql`update silabos set estado_silabo = 'en_revision', version_borrador = ${syllabus.version + 1} where silabo_id = ${syllabus.id}::uuid`)
    returned.push(syllabus.id)
  }
  return returned
}
