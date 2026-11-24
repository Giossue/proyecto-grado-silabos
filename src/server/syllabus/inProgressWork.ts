import "server-only"
import { unlink } from "node:fs/promises"
import { sql } from "drizzle-orm"
import { diskPath } from "../laravel/storage"
import { phpJsonEncode } from "../laravel/phpJson"
import { uuidList } from "../laravel/sql"
import { uuid7 } from "../laravel/uuid7"
import type { AfterCommit } from "../queue/dispatch"
import { loadSubjectContext } from "../configuration/subjectProfilePreview"
import { phpShape, type PhpRecord } from "../configuration/phpValues"
import { profileTemplates } from "../configuration/subjectProfileFields"
import { isCareerField, templateFields, type SyllabusTemplate } from "../configuration/templatePresentation"
import { createTemplateStore, type TemplateStore } from "../configuration/templateStore"
import { NeedsLaravel } from "./snapshotDocuments"
import { rowsOf, type Executor } from "./teacherSyllabusQueries"

export class GenerationRejected extends Error {
  constructor(readonly errors: Record<string, string[]>) {
    super("generation rejected")
  }
}

export const SYLLABUS_ALIVE = sql`exists (select 1 from convocatorias_carreras vivo where vivo.convocatoria_carrera_id = silabos.convocatoria_carrera_id
  and exists (select 1 from convocatorias_universidad vivo_proceso where vivo_proceso.convocatoria_universidad_id = vivo.convocatoria_universidad_id))`

type ParallelRow = { id: string; subject_id: string; code: string; shift: string | null; subject: string; campus: string | null; modality: string | null; teachers: number }

export type GenerateOptions = { subjectId?: string | null; subjectIds?: string[] | null; allowEmpty?: boolean; skipIncomplete?: boolean }

export class InProgressWork {
  private template: SyllabusTemplate | null | undefined
  readonly templates: TemplateStore

  constructor(
    readonly executor: Executor,
    readonly afterCommit: AfterCommit,
  ) {
    this.templates = createTemplateStore(executor)
  }

  async clearHistory(syllabusIds: string[]): Promise<string[]> {
    const executor = this.executor
    await executor.execute(sql`SET LOCAL app.reinicio_institucional = 'on'`)
    if (syllabusIds.length === 0) return []
    const revisionIds = (
      await rowsOf<{ id: string }>(executor, sql`select revision_silabo_id::text as id from revisiones_silabo where silabo_id in (${uuidList(syllabusIds)})`)
    ).map((row) => row.id)
    const exports =
      revisionIds.length === 0
        ? []
        : await rowsOf<{ object_id: string | null }>(
            executor,
            sql`select archivo_pdf_id::text as object_id from exportaciones_silabo where revision_silabo_id in (${uuidList(revisionIds)})`,
          )
    const objectIds = [...new Set(exports.map((row) => row.object_id).filter((id): id is string => id !== null && id !== ""))]
    const objects =
      objectIds.length === 0
        ? []
        : await rowsOf<{ disk: string; path: string }>(executor, sql`select disco as disk, ruta_archivo as path from archivos where archivo_id in (${uuidList(objectIds)})`)
    await executor.execute(sql`delete from firmas_silabo where silabo_id in (${uuidList(syllabusIds)})`)
    if (revisionIds.length > 0) await executor.execute(sql`delete from exportaciones_silabo where revision_silabo_id in (${uuidList(revisionIds)})`)
    if (objectIds.length > 0) await executor.execute(sql`delete from archivos where archivo_id in (${uuidList(objectIds)})`)
    this.afterCommit(async () => {
      for (const object of objects) {
        try {
          await unlink(/*turbopackIgnore: true*/ diskPath(object.disk, object.path))
        } catch {}
      }
    })
    if (revisionIds.length === 0) return []
    await executor.execute(sql`delete from envios_biblioteca where revision_silabo_id in (${uuidList(revisionIds)})`)
    await executor.execute(sql`delete from revisiones_coordinacion where revision_silabo_id in (${uuidList(revisionIds)})`)
    await executor.execute(sql`delete from aprobaciones where revision_silabo_id in (${uuidList(revisionIds)})`)
    const ordered = await rowsOf<{ id: string }>(
      executor,
      sql`select revision_silabo_id::text as id from revisiones_silabo where revision_silabo_id in (${uuidList(revisionIds)}) order by numero_revision desc`,
    )
    for (const row of ordered) await executor.execute(sql`delete from revisiones_silabo where revision_silabo_id = ${row.id}::uuid`)
    return revisionIds
  }

  async deleteAggregates(syllabusIds: string[]): Promise<void> {
    const revisionIds = await this.clearHistory(syllabusIds)
    const resources = [...syllabusIds, ...revisionIds]
    if (resources.length > 0) await this.executor.execute(sql`delete from notificaciones where recurso_id in (${uuidList(resources)})`)
    if (syllabusIds.length > 0) await this.executor.execute(sql`delete from silabos where silabo_id in (${uuidList(syllabusIds)}) and ${SYLLABUS_ALIVE}`)
  }

  private async institutionalTemplate(): Promise<SyllabusTemplate> {
    if (this.template === undefined) this.template = await this.templates.template()
    if (this.template === null || this.template.definition === null) throw new NeedsLaravel()
    return this.template
  }

  private async parallelRows(where: ReturnType<typeof sql>, careerId: string, lock: boolean): Promise<ParallelRow[]> {
    return rowsOf<ParallelRow>(
      this.executor,
      sql`select paralelo.paralelo_id::text as id, paralelo.asignatura_id::text as subject_id, paralelo.codigo_paralelo as code, paralelo.jornada_paralelo as shift,
          asignatura.nombre_asignatura as subject, facultad.campus_facultad as campus,
          coalesce(asignatura.modalidad_asignatura::text, carrera.modalidad_carrera::text) as modality,
          (select count(*)::int from asignaciones_paralelo asignacion where asignacion.paralelo_id = paralelo.paralelo_id and asignacion.asignacion_paralelo_activa = true
            and exists (select 1 from asignaciones_rol rol where rol.asignacion_rol_id = asignacion.asignacion_rol_id and rol.asignacion_rol_activa = true
              and rol.rol = 'docente' and rol.carrera_id = ${careerId}::uuid
              and exists (select 1 from usuarios usuario where usuario.usuario_id = rol.usuario_id and usuario.usuario_activo = true and usuario.correo_verificado_en is not null))) as teachers
        from paralelos paralelo
          inner join asignaturas asignatura on asignatura.asignatura_id = paralelo.asignatura_id
          inner join carreras carrera on carrera.carrera_id = asignatura.carrera_id
          left join facultades facultad on facultad.facultad_id = carrera.facultad_id
        where ${where}
        order by paralelo.asignatura_id asc, paralelo.codigo_paralelo asc ${lock ? sql`for update of paralelo` : sql``}`,
    )
  }

  async academicContext(parallel: ParallelRow, periodId: string): Promise<PhpRecord> {
    const subject = await loadSubjectContext(this.executor, parallel.subject_id)
    const [period] = await rowsOf<{ code: string; weeks: number | null }>(
      this.executor,
      sql`select codigo_periodo_academico as code, cantidad_semanas_lectivas as weeks from periodos_academicos where periodo_academico_id = ${periodId}::uuid limit 1`,
    )
    if (subject === null || !period || parallel.modality === null) throw new NeedsLaravel()
    return {
      ...subject,
      parallel: { id: parallel.id, code: parallel.code, shift: parallel.shift },
      scheduled_subject: { period: period.code, teaching_weeks: period.weeks === null ? null : Number(period.weeks), campus: parallel.campus, modality: parallel.modality },
    }
  }

  private async convocationPeriod(convocationId: string): Promise<{ careerId: string; periodId: string }> {
    const [row] = await rowsOf<{ career_id: string; period_id: string }>(
      this.executor,
      sql`select convocatoria.carrera_id::text as career_id, proceso.periodo_academico_id::text as period_id
        from convocatorias_carreras convocatoria inner join convocatorias_universidad proceso on proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id
        where convocatoria.convocatoria_carrera_id = ${convocationId}::uuid limit 1`,
    )
    if (!row) throw new NeedsLaravel()
    return { careerId: row.career_id, periodId: row.period_id }
  }

  private async generate(convocationId: string, periodId: string, parallel: ParallelRow): Promise<string> {
    const context = await this.academicContext(parallel, periodId)
    const id = uuid7()
    await this.executor.execute(sql`insert into silabos (silabo_id, convocatoria_carrera_id, paralelo_id, datos_academicos_silabo, estado_silabo)
      values (${id}::uuid, ${convocationId}::uuid, ${parallel.id}::uuid, ${phpJsonEncode(phpShape(context))}::jsonb, 'sin_iniciar')`)
    const template = await this.institutionalTemplate()
    const templates = await profileTemplates({ template, definition: template.definition!, store: this.templates }, parallel.subject_id)
    for (const field of templateFields(template)) {
      if (!isCareerField(field)) continue
      const value = templates[field.id] ?? field.content
      await this.executor.execute(sql`insert into valores_campo (valor_campo_id, silabo_id, definicion_campo_id, valor_campo)
        values (${uuid7()}::uuid, ${id}::uuid, ${field.id}::uuid, ${phpJsonEncode(phpShape(value))}::jsonb)`)
    }
    return id
  }

  async generateForParallel(convocationId: string, parallelId: string): Promise<string> {
    const { careerId, periodId } = await this.convocationPeriod(convocationId)
    const [parallel] = await this.parallelRows(sql`paralelo.paralelo_id = ${parallelId}::uuid`, careerId, false)
    if (!parallel) throw new NeedsLaravel()
    return this.generate(convocationId, periodId, parallel)
  }

  async generateConvocation(convocationId: string, options: GenerateOptions = {}): Promise<number> {
    const { careerId, periodId } = await this.convocationPeriod(convocationId)
    const filters = [sql`asignatura.carrera_id = ${careerId}::uuid`, sql`asignatura.asignatura_activa = true`, sql`asignatura.genera_silabo_asignatura = true`]
    if (options.subjectId != null) filters.push(sql`paralelo.asignatura_id = ${options.subjectId}::uuid`)
    if (options.subjectIds != null) filters.push(options.subjectIds.length === 0 ? sql`false` : sql`paralelo.asignatura_id in (${uuidList(options.subjectIds)})`)
    const parallels = await this.parallelRows(sql.join(filters, sql` and `), careerId, true)
    if (parallels.length > 0) {
      await this.executor.execute(sql`select asignacion_paralelo_id from asignaciones_paralelo where paralelo_id in (${uuidList(parallels.map((row) => row.id))})
        and asignacion_paralelo_activa = true for update`)
    }
    if (parallels.length === 0 && options.allowEmpty) return 0
    if (parallels.length === 0) throw new GenerationRejected({ convocation: ["No existen paralelos de la carrera."] })
    const covered = new Set(
      (
        await rowsOf<{ id: string }>(
          this.executor,
          sql`select silabos.paralelo_id::text as id from silabos where silabos.convocatoria_carrera_id = ${convocationId}::uuid and ${SYLLABUS_ALIVE}`,
        )
      ).map((row) => row.id),
    )
    const groups = new Map<string, ParallelRow[]>()
    for (const parallel of parallels) groups.set(parallel.subject_id, [...(groups.get(parallel.subject_id) ?? []), parallel])
    for (const group of groups.values()) {
      const pending = group.filter((parallel) => !covered.has(parallel.id))
      if (!options.skipIncomplete && pending.some((parallel) => Number(parallel.teachers) !== 1)) {
        throw new GenerationRejected({ convocation: [`La materia ${group[0].subject} debe tener exactamente un docente vigente por paralelo.`] })
      }
    }
    let generated = 0
    for (const parallel of parallels) {
      if (covered.has(parallel.id) || (options.skipIncomplete && Number(parallel.teachers) !== 1)) continue
      await this.generate(convocationId, periodId, parallel)
      generated++
    }
    return generated
  }

  async restartSyllabus(syllabus: { id: string; convocationId: string; parallelId: string }): Promise<string> {
    await this.deleteAggregates([syllabus.id])
    await this.generateForParallel(syllabus.convocationId, syllabus.parallelId)
    const [fresh] = await rowsOf<{ id: string }>(
      this.executor,
      sql`select silabos.silabo_id::text as id from silabos where silabos.convocatoria_carrera_id = ${syllabus.convocationId}::uuid
        and silabos.paralelo_id = ${syllabus.parallelId}::uuid and ${SYLLABUS_ALIVE} limit 1`,
    )
    if (!fresh) throw new NeedsLaravel()
    return fresh.id
  }
}
