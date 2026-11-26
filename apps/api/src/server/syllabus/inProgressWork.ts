import { MODELS } from "../http/models"
import { failServerError, Missing } from "../http/failures"
import { randomUUID } from "node:crypto"
import { Prisma } from "../../generated/prisma/client"
import { storageWriter } from "../http/storageWriter"
import { uuidList } from "../../prisma/sql"
import { uuid7 } from "../http/uuid7"
import type { AfterCommit } from "../queue/dispatch"
import { loadSubjectContext } from "../configuration/subjectProfilePreview"
import { isPhpArray, isRecord, phpEquals, phpIdentical, phpJsonDecode, phpShape, record, type PhpRecord } from "../configuration/phpValues"
import { profileFields, profileTemplateOf, profileTemplates, profileValues, type ProfileContext } from "../configuration/subjectProfileFields"
import { isCareerField, teacherEditable, templateFields, type SyllabusTemplate, type TemplateField } from "../configuration/templatePresentation"
import {
  fieldCarried,
  fieldFits,
  normalizeFieldDocument,
  openTemplate,
  responseOptionsOf,
  responseWithin,
  templateFor,
  TemplateValidationError,
  withoutOwnOptions,
} from "../configuration/templateRuntime"
import { createTemplateStore, type TemplateStore } from "../shared/templateStore"
import { recipientsOn } from "../notifications/queries"
import { scheduleWorkflowNotification, storeInternalNotifications, type NotificationScope } from "../notifications/store"
import { sameStructure, fieldResponseNormalize, documentIsEmpty } from "../configuration/templateRehearsal"
import { dataGet } from "./identificationCard"
import { DOCUMENT_PATHS, GenerationRejected, purgeRequired, SENT_STATES, type GenerateOptions, type WorkScope, type WorkSyllabus } from "./inProgressWorkHelpers"
import { rowsOf, type Executor } from "./teacherSyllabusQueries"

export const SYLLABUS_ALIVE = Prisma.sql`exists (select 1 from convocatorias_carreras vivo where vivo.convocatoria_carrera_id = silabos.convocatoria_carrera_id
  and exists (select 1 from convocatorias_universidad vivo_proceso where vivo_proceso.convocatoria_universidad_id = vivo.convocatoria_universidad_id))`

type ParallelRow = { id: string; subject_id: string; code: string; shift: string | null; subject: string; campus: string | null; modality: string | null; teachers: number }

export const CONFIRMATION_FIELD = "confirm_purge"
export const DEFAULT_REASON = "cambió la base institucional (malla, período académico o plantilla)"
export const BACK_TO_DRAFT_EVENT = "silabo.devuelto_borrador"
const SILENT_PATHS = ["subject.position", "curriculum.cycle_count", "career.code"]

type PendingChange = { syllabus: WorkSyllabus; context: PhpRecord; documents: Map<string, unknown>; backToDraft: boolean }

type DocumentsFor = (parallel: ParallelRow, syllabus: WorkSyllabus) => Promise<Map<string, unknown>>

export type SubjectProfiles = Map<string, Map<string, PhpRecord | null>>

export function idsIn(column: Prisma.Sql, ids: string[]): Prisma.Sql {
  return ids.length === 0 ? Prisma.sql`0 = 1` : Prisma.sql`${column} in (${uuidList(ids)})`
}

export function forSubjects(subjectIds: string[]): Prisma.Sql {
  return Prisma.sql`exists (select 1 from paralelos paralelo_materia where paralelo_materia.paralelo_id = silabos.paralelo_id and ${idsIn(Prisma.sql`paralelo_materia.asignatura_id`, subjectIds)})`
}

export function inProgressFilter(scope: WorkScope = {}): Prisma.Sql {
  const conditions: Prisma.Sql[] = []
  if (scope.subjectId != null) conditions.push(forSubjects([scope.subjectId]))
  if (scope.subjectIds != null) conditions.push(forSubjects(scope.subjectIds))
  const convocation: Prisma.Sql[] = [
    Prisma.sql`convocatoria_curso.convocatoria_carrera_id = silabos.convocatoria_carrera_id`,
    Prisma.sql`convocatoria_curso.estado_convocatoria_carrera in ('abierta', 'pausada')`,
    Prisma.sql`exists (select 1 from convocatorias_universidad proceso_curso where proceso_curso.convocatoria_universidad_id = convocatoria_curso.convocatoria_universidad_id
      and proceso_curso.estado_convocatoria_universidad in ('abierto', 'pausado'))`,
  ]
  if (typeof scope.careerIds === "string") convocation.push(Prisma.sql`convocatoria_curso.carrera_id = ${scope.careerIds}::uuid`)
  if (Array.isArray(scope.careerIds)) convocation.push(idsIn(Prisma.sql`convocatoria_curso.carrera_id`, scope.careerIds))
  if (scope.periodId != null) {
    convocation.push(Prisma.sql`exists (select 1 from convocatorias_universidad proceso_periodo where proceso_periodo.convocatoria_universidad_id = convocatoria_curso.convocatoria_universidad_id
      and proceso_periodo.periodo_academico_id = ${scope.periodId}::uuid)`)
  }
  conditions.push(Prisma.sql`exists (select 1 from convocatorias_carreras convocatoria_curso where ${Prisma.join(convocation, " and ")})`)
  conditions.push(SYLLABUS_ALIVE)
  return Prisma.join(conditions, " and ")
}

function dataSet(target: PhpRecord, path: string, value: unknown): void {
  const segments = path.split(".")
  let current = target
  for (const segment of segments.slice(0, -1)) {
    if (!isRecord(current[segment])) current[segment] = Array.isArray(current[segment]) ? Object.fromEntries((current[segment] as unknown[]).map((item, index) => [String(index), item])) : {}
    current = current[segment] as PhpRecord
  }
  current[segments[segments.length - 1]] = value
}

function arrHas(target: unknown, path: string): boolean {
  let current = target
  for (const segment of path.split(".")) {
    if (!isPhpArray(current)) return false
    const keyed = Array.isArray(current) ? Object.fromEntries(current.map((item, index) => [String(index), item])) : current
    if (!Object.prototype.hasOwnProperty.call(keyed, segment)) return false
    current = (keyed as PhpRecord)[segment]
  }
  return true
}

function deepCopy(value: PhpRecord): PhpRecord {
  return structuredClone(value)
}

function subjectNames(subjects: string[]): string {
  return subjects.length > 1 ? `${subjects.slice(0, -1).join(", ")} y ${subjects[subjects.length - 1]}` : (subjects[0] ?? "")
}

function backToDraftRequired(count: number): Record<string, string[]> {
  return {
    purge_required: [
      count === 1
        ? "Este cambio devolverá 1 sílabo enviado o aprobado a borrador. Se conserva lo escrito; el docente deberá enviarlo y firmarlo de nuevo, y recibirá un aviso por correo."
        : `Este cambio devolverá ${count} sílabos enviados o aprobados a borrador. Se conserva lo escrito; cada docente deberá enviarlo y firmarlo de nuevo, y recibirá un aviso por correo.`,
    ],
    purge_count: [String(count)],
  }
}

const WORK_SYLLABUS_COLUMNS = Prisma.sql`silabos.silabo_id::text as id, silabos.convocatoria_carrera_id::text as convocation_id, silabos.paralelo_id::text as parallel_id,
  silabos.estado_silabo as state, silabos.datos_academicos_silabo::text as context, silabos.iniciado_en is not null as started, silabos.version_borrador as version`

type WorkSyllabusRow = { id: string; convocation_id: string; parallel_id: string; state: string; context: string; started: boolean; version: number }

export function workSyllabus(row: WorkSyllabusRow): WorkSyllabus {
  return {
    id: row.id,
    convocationId: row.convocation_id,
    parallelId: row.parallel_id,
    state: row.state,
    context: record(phpJsonDecode(row.context)),
    started: row.started,
    version: Number(row.version),
  }
}

export class InProgressWork {
  private template: SyllabusTemplate | null | undefined
  readonly templates: TemplateStore

  constructor(
    readonly executor: Executor,
    readonly afterCommit: AfterCommit,
    readonly notifications?: NotificationScope,
  ) {
    this.templates = createTemplateStore(executor)
  }

  private scope(): NotificationScope {
    if (this.notifications === undefined) throw new Error("InProgressWork needs a notification scope.")
    return this.notifications
  }

  private now(): number {
    return this.notifications?.now ?? Math.floor(Date.now() / 1000)
  }

  async profileContext(): Promise<ProfileContext> {
    const template = await this.institutionalTemplate()
    return { template, definition: template.definition!, store: this.templates }
  }

  async syllabi(where: Prisma.Sql, options: { lock?: boolean; ordered?: boolean } = {}): Promise<WorkSyllabus[]> {
    const rows = await rowsOf<WorkSyllabusRow>(
      this.executor,
      Prisma.sql`select ${WORK_SYLLABUS_COLUMNS} from silabos where ${where} ${options.ordered ? Prisma.sql`order by silabos.silabo_id asc` : Prisma.empty} ${options.lock ? Prisma.sql`for update of silabos` : Prisma.empty}`,
    )
    return rows.map(workSyllabus)
  }

  async count(scope: WorkScope = {}): Promise<number> {
    const [row] = await rowsOf<{ count: number }>(this.executor, Prisma.sql`select count(*)::int as count from silabos where ${inProgressFilter(scope)}`)
    return Number(row.count)
  }

  async requireConfirmation(confirmed: boolean, scope: WorkScope = {}): Promise<number> {
    const count = await this.count(scope)
    if (count === 0) return 0
    if (!confirmed) throw new GenerationRejected(purgeRequired(count))
    return count
  }

  async replace<T>(confirmed: boolean, change: () => Promise<T>, scope: WorkScope = {}, reason: string | null = null): Promise<T> {
    const count = await this.requireConfirmation(confirmed, scope)
    const result = await change()
    if (count > 0) await this.regenerate(scope, reason)
    return result
  }

  async currentTeachers(syllabusIds: string[]): Promise<Map<string, string[]>> {
    const teachers = new Map<string, string[]>()
    if (syllabusIds.length === 0) return teachers
    const rows = await rowsOf<{ syllabus_id: string; user_id: string }>(
      this.executor,
      Prisma.sql`select distinct docentes.silabo_id::text as syllabus_id, docentes.usuario_id::text as user_id from docentes_vigentes_silabo docentes
        where docentes.silabo_id in (${uuidList(syllabusIds)})`,
    )
    for (const row of rows) teachers.set(row.syllabus_id, [...(teachers.get(row.syllabus_id) ?? []), row.user_id])
    return teachers
  }

  private async subjectName(syllabus: WorkSyllabus): Promise<string> {
    const name = dataGet(syllabus.context, "subject.name")
    if (typeof name === "string") return name
    const [row] = await rowsOf<{ name: string }>(
      this.executor,
      Prisma.sql`select asignatura.nombre_asignatura as name from paralelos paralelo inner join asignaturas asignatura on asignatura.asignatura_id = paralelo.asignatura_id
        where paralelo.paralelo_id = ${syllabus.parallelId}::uuid limit 1`,
    )
    if (!row) failServerError()
    return row.name
  }

  private async notifyRestarted(recipientIds: string[], subjects: string[], count: number, reason: string, resourceType: string, resourceId: string, periodId: string | null): Promise<void> {
    const names = subjectNames(subjects)
    const [title, which, complete] =
      count > 1 ? ["Sus sílabos volvieron a empezar", `de los sílabos de ${names}`, "Complételos"] : ["Su sílabo volvió a empezar", `del sílabo de ${names}`, "Complételo"]
    await storeInternalNotifications(this.scope(), {
      eventType: "silabo.regenerado",
      deduplicationKey: `silabo.regenerado:${resourceId}:${randomUUID()}`,
      recipientIds,
      title,
      message: `Se perdió el contenido anterior ${which} (borrador, revisiones, aprobación, firmas y análisis de IA) porque ${reason}. ${complete} otra vez.`,
      resourceType,
      resourceId,
      periodId,
    })
  }

  private async notifyAssigned(syllabusId: string, parallel: ParallelRow, periodId: string): Promise<void> {
    await storeInternalNotifications(this.scope(), {
      eventType: "silabo.asignado",
      deduplicationKey: `silabo.asignado:${syllabusId}`,
      recipientIds: (await this.currentTeachers([syllabusId])).get(syllabusId) ?? [],
      title: "Tiene un sílabo nuevo",
      message: `Ya puede elaborar el sílabo de ${parallel.subject}, paralelo ${parallel.code}.`,
      resourceType: "silabo",
      resourceId: syllabusId,
      periodId,
    })
  }

  private async convocationFacts(convocationIds: string[]): Promise<Map<string, { careerId: string; periodId: string }>> {
    const facts = new Map<string, { careerId: string; periodId: string }>()
    if (convocationIds.length === 0) return facts
    const rows = await rowsOf<{ id: string; career_id: string; period_id: string }>(
      this.executor,
      Prisma.sql`select convocatoria.convocatoria_carrera_id::text as id, convocatoria.carrera_id::text as career_id, proceso.periodo_academico_id::text as period_id
        from convocatorias_carreras convocatoria inner join convocatorias_universidad proceso on proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id
        where convocatoria.convocatoria_carrera_id in (${uuidList(convocationIds)})`,
    )
    for (const row of rows) facts.set(row.id, { careerId: row.career_id, periodId: row.period_id })
    return facts
  }

  async regenerate(scope: WorkScope = {}, reason: string | null = null, skipIncomplete = false): Promise<{ deleted: number; generated: number }> {
    const syllabi = await this.syllabi(inProgressFilter(scope), { lock: true })
    if (syllabi.length === 0) return { deleted: 0, generated: 0 }
    const convocationIds = [...new Set(syllabi.map((syllabus) => syllabus.convocationId))]
    const syllabusIds = syllabi.map((syllabus) => syllabus.id)
    const teachers = await this.currentTeachers(syllabusIds)
    const facts = await this.convocationFacts(convocationIds)
    const subjects = new Map<string, string>()
    for (const syllabus of syllabi) subjects.set(syllabus.id, await this.subjectName(syllabus))
    await this.deleteAggregates(syllabusIds)
    const groups = new Map<string, { teacher: string; career: string; period: string | null; subjects: string[] }>()
    for (const syllabus of syllabi) {
      const fact = facts.get(syllabus.convocationId)
      for (const teacher of teachers.get(syllabus.id) ?? []) {
        const career = fact?.careerId ?? ""
        const period = fact?.periodId ?? null
        const key = `${teacher}|${career}|${period ?? ""}`
        const group = groups.get(key) ?? { teacher, career, period, subjects: [] }
        group.subjects.push(subjects.get(syllabus.id) ?? "")
        groups.set(key, group)
      }
    }
    for (const group of groups.values()) {
      await this.notifyRestarted([group.teacher], [...new Set(group.subjects)], group.subjects.length, reason ?? DEFAULT_REASON, "carrera", group.career, group.period)
    }
    const locked = await rowsOf<{ id: string }>(
      this.executor,
      Prisma.sql`select convocatoria_carrera_id::text as id from convocatorias_carreras where convocatoria_carrera_id in (${uuidList(convocationIds)})
        and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id) for update`,
    )
    let generated = 0
    for (const convocation of locked) {
      generated += await this.generateConvocation(convocation.id, { subjectId: scope.subjectId, subjectIds: scope.subjectIds, allowEmpty: true, skipIncomplete })
    }
    return { deleted: syllabusIds.length, generated }
  }

  async restartForParallel(parallelId: string): Promise<number> {
    const syllabi = await this.syllabi(Prisma.sql`${inProgressFilter()} and silabos.paralelo_id = ${parallelId}::uuid`, { lock: true })
    if (syllabi.length === 0) return 0
    await this.deleteAggregates(syllabi.map((syllabus) => syllabus.id))
    for (const syllabus of syllabi) await this.generateForParallel(syllabus.convocationId, syllabus.parallelId)
    return syllabi.length
  }

  async restartSentForParallel(parallelId: string): Promise<number> {
    const syllabi = await this.syllabi(Prisma.sql`${inProgressFilter()} and silabos.paralelo_id = ${parallelId}::uuid and silabos.estado_silabo in ('en_revision', 'aprobado')`, {
      lock: true,
    })
    const teachers = await this.currentTeachers(syllabi.map((syllabus) => syllabus.id))
    const facts = await this.convocationFacts([...new Set(syllabi.map((syllabus) => syllabus.convocationId))])
    for (const syllabus of syllabi) {
      const subject = await this.subjectName(syllabus)
      const periodId = facts.get(syllabus.convocationId)?.periodId ?? null
      const fresh = await this.restartSyllabus(syllabus)
      await this.notifyRestarted(teachers.get(syllabus.id) ?? [], [subject], 1, "Coordinación cambió el código o la jornada del paralelo", "silabo", fresh, periodId)
    }
    return syllabi.length
  }

  async refreshParallel(parallelId: string): Promise<number> {
    const syllabi = await this.syllabi(Prisma.sql`${inProgressFilter()} and silabos.paralelo_id = ${parallelId}::uuid`, { lock: true })
    for (const syllabus of syllabi) await this.applyIdentification(syllabus)
    return syllabi.length
  }

  private async applyIdentification(syllabus: WorkSyllabus): Promise<void> {
    const [row] = await rowsOf<{ name: string; code: string; faculty: string | null; faculty_id: string | null }>(
      this.executor,
      Prisma.sql`select carrera.nombre_carrera as name, carrera.codigo_carrera as code, facultad.nombre_facultad as faculty, carrera.facultad_id::text as faculty_id
        from convocatorias_carreras convocatoria inner join carreras carrera on carrera.carrera_id = convocatoria.carrera_id
          left join facultades facultad on facultad.facultad_id = carrera.facultad_id
        where convocatoria.convocatoria_carrera_id = ${syllabus.convocationId}::uuid limit 1`,
    )
    const parallel = await this.parallelById(syllabus.parallelId)
    if (!row || parallel === null || parallel.modality === null) failServerError()
    const context = deepCopy(syllabus.context)
    dataSet(context, "career.name", row.name)
    dataSet(context, "career.code", row.code)
    dataSet(context, "career.faculty", row.faculty)
    dataSet(context, "career.faculty_id", row.faculty_id)
    dataSet(context, "parallel.id", parallel.id)
    dataSet(context, "parallel.code", parallel.code)
    dataSet(context, "parallel.shift", parallel.shift)
    dataSet(context, "scheduled_subject.campus", parallel.campus)
    dataSet(context, "scheduled_subject.modality", parallel.modality)
    await this.saveContext(syllabus, context)
  }

  private async saveContext(syllabus: WorkSyllabus, context: PhpRecord): Promise<void> {
    if (phpIdentical(context, syllabus.context)) return
    await this.executor.$executeRaw(Prisma.sql`update silabos set datos_academicos_silabo = ${JSON.stringify(phpShape(context))}::jsonb where silabo_id = ${syllabus.id}::uuid`)
    syllabus.context = context
  }

  async parallelsWithStartedSyllabus(parallelIds: string[]): Promise<string[]> {
    if (parallelIds.length === 0) return []
    const rows = await rowsOf<{ id: string }>(
      this.executor,
      Prisma.sql`select silabos.paralelo_id::text as id from silabos where ${inProgressFilter()} and ${idsIn(Prisma.sql`silabos.paralelo_id`, parallelIds)}
        and (silabos.estado_silabo != 'sin_iniciar' or silabos.iniciado_en is not null)`,
    )
    return [...new Set(rows.map((row) => row.id))]
  }

  async parallelsWithSentSyllabus(parallelIds: string[]): Promise<string[]> {
    if (parallelIds.length === 0) return []
    const rows = await rowsOf<{ id: string }>(
      this.executor,
      Prisma.sql`select silabos.paralelo_id::text as id from silabos where ${inProgressFilter()} and ${idsIn(Prisma.sql`silabos.paralelo_id`, parallelIds)}
        and silabos.estado_silabo in ('en_revision', 'aprobado')`,
    )
    return [...new Set(rows.map((row) => row.id))]
  }

  async parallelHasSentSyllabus(parallelId: string): Promise<boolean> {
    return (await this.parallelsWithSentSyllabus([parallelId])).length > 0
  }

  async adaptToTemplate(syllabus: WorkSyllabus): Promise<void> {
    if (syllabus.state === "sin_iniciar") {
      await this.restartSyllabus(syllabus)
      return
    }
    const stored = await rowsOf<{ field_id: string; value: string | null }>(
      this.executor,
      Prisma.sql`select definicion_campo_id::text as field_id, valor_campo::text as value from valores_campo where silabo_id = ${syllabus.id}::uuid`,
    )
    const fieldIds = [...new Set(stored.map((row) => row.field_id))]
    const keys = new Map(
      (fieldIds.length === 0
        ? []
        : await rowsOf<{ id: string; key: string | null }>(
            this.executor,
            Prisma.sql`select definicion.definicion_campo_id::text as id, campo.clave_campo_plantilla as key from definiciones_campo definicion
              left join campos_plantilla campo on campo.campo_plantilla_id = definicion.campo_plantilla_id
              where definicion.definicion_campo_id in (${uuidList(fieldIds)})`,
          )
      ).map((row) => [row.id, row.key ?? ""]),
    )
    const previous = new Map<string, unknown>()
    for (const row of stored) {
      const key = keys.get(row.field_id) ?? ""
      if (key !== "") previous.set(key, phpJsonDecode(row.value))
    }
    const context = await this.profileContext()
    const [subject] = await rowsOf<{ id: string }>(this.executor, Prisma.sql`select asignatura_id::text as id from paralelos where paralelo_id = ${syllabus.parallelId}::uuid limit 1`)
    if (!subject) failServerError()
    const templates = await profileTemplates(context, subject.id)
    let state = syllabus.state
    if (SENT_STATES.includes(syllabus.state)) {
      await this.clearHistory([syllabus.id])
      state = "borrador"
    }
    await this.executor.$executeRaw(Prisma.sql`delete from valores_campo where silabo_id = ${syllabus.id}::uuid`)
    for (const field of templateFields(context.template)) {
      if (!isCareerField(field)) continue
      const template = templates[field.id] ?? field.content
      const document = teacherEditable(field, templates) ? this.stillFits(field, previous.get(field.key) ?? null, template, context) : template
      const value = document === null || documentIsEmpty(document, context.definition) ? template : document
      await this.executor.$executeRaw(Prisma.sql`insert into valores_campo (valor_campo_id, silabo_id, definicion_campo_id, valor_campo)
        values (${uuid7()}::uuid, ${syllabus.id}::uuid, ${field.id}::uuid, ${JSON.stringify(phpShape(value))}::jsonb)`)
    }
    await this.executor.$executeRaw(Prisma.sql`update silabos set estado_silabo = ${state}, version_borrador = ${syllabus.version + 1}, guardado_en = to_timestamp(${this.now()})
      where silabo_id = ${syllabus.id}::uuid`)
  }

  private stillFits(field: TemplateField, value: unknown, template: unknown, context: ProfileContext): unknown {
    if (!isPhpArray(value)) return null
    let document: PhpRecord
    try {
      document = fieldResponseNormalize(template, value, context.definition)
    } catch (error) {
      if (error instanceof TemplateValidationError) return null
      throw error
    }
    return sameStructure(normalizeFieldDocument(field.content, context.definition), document) ? document : null
  }

  async profilesFor(subjectIds: string[]): Promise<SubjectProfiles> {
    const profiles: SubjectProfiles = new Map()
    if (subjectIds.length === 0) return profiles
    const context = await this.profileContext()
    for (const subjectId of subjectIds) profiles.set(subjectId, await profileValues(context, subjectId))
    return profiles
  }

  async subjectsInProgress(careerId: string, subjectIds: string[] | null = null): Promise<string[]> {
    const rows = await rowsOf<{ id: string }>(
      this.executor,
      Prisma.sql`select paralelos.asignatura_id::text as id from silabos inner join paralelos on paralelos.paralelo_id = silabos.paralelo_id
        where ${inProgressFilter({ careerIds: careerId, subjectIds })}`,
    )
    return [...new Set(rows.map((row) => row.id))]
  }

  async sync(confirmed: boolean, careerId: string | string[], subjectIds: string[] | null = null, profilesBefore: SubjectProfiles = new Map()): Promise<number> {
    const syllabi = await this.syllabi(inProgressFilter({ careerIds: careerId, subjectIds }), { lock: true })
    const context = profilesBefore.size === 0 ? null : await this.profileContext()
    const fields = context === null ? [] : profileFields(context)
    const profilesAfter = await this.profilesFor([...profilesBefore.keys()])
    const pending = await this.pendingChanges(syllabi, async (parallel, syllabus) => {
      const documents = new Map<string, unknown>()
      if (context === null) return documents
      for (const field of fields) {
        const before = profilesBefore.get(parallel.subject_id)?.get(field.id) ?? null
        const after = profilesAfter.get(parallel.subject_id)?.get(field.id) ?? null
        if (phpEquals(before, after)) continue
        const template = profileTemplateOf(field.content, after, context.definition)
        if (template === null || openTemplate(template)) {
          for (const [id, document] of await this.rebuilt(syllabus, field, template ?? field.content, context)) if (!documents.has(id)) documents.set(id, document)
        } else if (!documents.has(field.id)) documents.set(field.id, template)
      }
      return documents
    })
    const count = pending.filter((item) => item.backToDraft).length
    if (count > 0 && !confirmed) throw new GenerationRejected(backToDraftRequired(count))
    await this.applyChanges(pending)
    return count
  }

  async returningToDraft(syllabi: WorkSyllabus[]): Promise<string[]> {
    const pending = await this.pendingChanges(syllabi, await this.heldDocuments(), true)
    return pending.filter((item) => item.backToDraft).map((item) => item.syllabus.id)
  }

  async catchUp(careerIds: string[]): Promise<void> {
    const syllabi = await this.syllabi(inProgressFilter({ careerIds }), { lock: true, ordered: true })
    await this.applyChanges(await this.pendingChanges(syllabi, await this.heldDocuments(), true))
  }

  private async parallelById(parallelId: string): Promise<ParallelRow | null> {
    const [parallel] = await rowsOf<ParallelRow>(
      this.executor,
      Prisma.sql`select paralelo.paralelo_id::text as id, paralelo.asignatura_id::text as subject_id, paralelo.codigo_paralelo as code, paralelo.jornada_paralelo as shift,
          asignatura.nombre_asignatura as subject, facultad.campus_facultad as campus,
          coalesce(asignatura.modalidad_asignatura::text, carrera.modalidad_carrera::text) as modality, 0 as teachers
        from paralelos paralelo
          inner join asignaturas asignatura on asignatura.asignatura_id = paralelo.asignatura_id
          inner join carreras carrera on carrera.carrera_id = asignatura.carrera_id
          left join facultades facultad on facultad.facultad_id = carrera.facultad_id
        where paralelo.paralelo_id = ${parallelId}::uuid limit 1`,
    )
    return parallel ?? null
  }

  async contextOf(parallelId: string, periodId: string): Promise<{ parallel: ParallelRow; context: PhpRecord } | null> {
    const parallel = await this.parallelById(parallelId)
    if (parallel === null) return null
    return { parallel, context: await this.academicContext(parallel, periodId) }
  }

  private async pendingChanges(syllabi: WorkSyllabus[], documentsFor: DocumentsFor, onlyStoredPaths = false): Promise<PendingChange[]> {
    const pending: PendingChange[] = []
    const facts = await this.convocationFacts([...new Set(syllabi.map((syllabus) => syllabus.convocationId))])
    for (const syllabus of syllabi) {
      const fact = facts.get(syllabus.convocationId)
      if (fact === undefined) failServerError()
      const built = await this.contextOf(syllabus.parallelId, fact.periodId)
      if (built === null) continue
      const { parallel, context } = built
      const updated = deepCopy(syllabus.context)
      const career = dataGet(updated, "career")
      if (!(isRecord(career) && Object.prototype.hasOwnProperty.call(career, "faculty_logo"))) dataSet(updated, "career.faculty_logo", dataGet(context, "career.faculty_logo"))
      let visible = false
      let silent = false
      for (const path of [...DOCUMENT_PATHS, ...SILENT_PATHS]) {
        const value = dataGet(context, path)
        if (!phpEquals(dataGet(updated, path), value)) {
          if (DOCUMENT_PATHS.includes(path) && (!onlyStoredPaths || arrHas(updated, path))) visible = true
          else silent = true
          dataSet(updated, path, value)
        }
      }
      const documents = await documentsFor(parallel, syllabus)
      if (!visible && !silent && documents.size === 0) continue
      pending.push({ syllabus, context: updated, documents, backToDraft: (visible || documents.size > 0) && SENT_STATES.includes(syllabus.state) })
    }
    return pending
  }

  private async heldDocuments(): Promise<DocumentsFor> {
    const context = await this.profileContext()
    const fields = profileFields(context)
    const built = new Map<string, Record<string, PhpRecord>>()
    return async (parallel, syllabus) => {
      if (!built.has(parallel.subject_id)) built.set(parallel.subject_id, await profileTemplates(context, parallel.subject_id))
      const templates = built.get(parallel.subject_id) as Record<string, PhpRecord>
      const held = await this.heldValues(syllabus.id)
      const documents = new Map<string, unknown>()
      for (const field of fields) {
        if (!held.has(field.id)) continue
        const value = held.get(field.id)
        const template = templates[field.id] ?? field.content
        if (!teacherEditable(field, templates)) {
          if (
            !phpEquals(withoutOwnOptions(value), template) &&
            (!phpEquals(withoutOwnOptions(templateFor(field.content, value, context.definition)), template) ||
              !phpEquals(responseOptionsOf(value), responseOptionsOf(template)))
          ) {
            documents.set(field.id, template)
          }
          continue
        }
        if (field.id in templates || responseWithin(value)) {
          for (const [id, document] of await this.rebuilt(syllabus, field, template, context, { value })) if (!documents.has(id)) documents.set(id, document)
        }
      }
      return documents
    }
  }

  private async heldValues(syllabusId: string): Promise<Map<string, unknown>> {
    const rows = await rowsOf<{ field_id: string; value: string | null }>(
      this.executor,
      Prisma.sql`select definicion_campo_id::text as field_id, valor_campo::text as value from valores_campo where silabo_id = ${syllabusId}::uuid`,
    )
    return new Map(rows.map((row) => [row.field_id, phpJsonDecode(row.value)]))
  }

  private async rebuilt(syllabus: WorkSyllabus, field: TemplateField, template: unknown, context: ProfileContext, held?: { value: unknown }): Promise<Map<string, unknown>> {
    let found = held
    if (found === undefined) {
      const [row] = await rowsOf<{ value: string | null }>(
        this.executor,
        Prisma.sql`select valor_campo::text as value from valores_campo where silabo_id = ${syllabus.id}::uuid and definicion_campo_id = ${field.id}::uuid limit 1`,
      )
      found = row ? { value: phpJsonDecode(row.value) } : undefined
    }
    if (found === undefined || fieldFits(template, found.value, context.definition)) return new Map()
    return new Map([[field.id, fieldCarried(template, found.value, context.definition)]])
  }

  private async applyChanges(pending: PendingChange[]): Promise<void> {
    const returning = pending.filter((item) => item.backToDraft)
    if (returning.length > 0) await this.clearHistory(returning.map((item) => item.syllabus.id))
    const recipients = recipientsOn(this.executor)
    for (const item of pending) {
      const { syllabus } = item
      for (const [fieldId, document] of item.documents) {
        const [existing] = await rowsOf<{ id: string; value: string | null }>(
          this.executor,
          Prisma.sql`select valor_campo_id::text as id, valor_campo::text as value from valores_campo where silabo_id = ${syllabus.id}::uuid and definicion_campo_id = ${fieldId}::uuid limit 1`,
        )
        const encoded = JSON.stringify(phpShape(document))
        if (existing) {
          if (!phpIdentical(phpJsonDecode(existing.value), phpJsonDecode(encoded))) {
            await this.executor.$executeRaw(Prisma.sql`update valores_campo set valor_campo = ${encoded}::jsonb where valor_campo_id = ${existing.id}::uuid`)
          }
        } else {
          await this.executor.$executeRaw(Prisma.sql`insert into valores_campo (valor_campo_id, silabo_id, definicion_campo_id, valor_campo)
            values (${uuid7()}::uuid, ${syllabus.id}::uuid, ${fieldId}::uuid, ${encoded}::jsonb)`)
        }
      }
      if (item.backToDraft) {
        await this.executor.$executeRaw(Prisma.sql`update silabos set datos_academicos_silabo = ${JSON.stringify(phpShape(item.context))}::jsonb, estado_silabo = 'borrador',
          version_borrador = ${syllabus.version + 1}, guardado_en = to_timestamp(${this.now()}) where silabo_id = ${syllabus.id}::uuid`)
        await scheduleWorkflowNotification(this.scope(), {
          syllabusId: syllabus.id,
          eventType: BACK_TO_DRAFT_EVENT,
          deduplicationKey: `${BACK_TO_DRAFT_EVENT}:${syllabus.id}:${randomUUID()}`,
          recipientIds: await recipients.teachersFor(syllabus.id),
          revisionNumber: null,
        })
      } else {
        await this.saveContext(syllabus, item.context)
      }
    }
  }

  async clearHistory(syllabusIds: string[]): Promise<string[]> {
    const executor = this.executor
    await executor.$executeRaw(Prisma.sql`SET LOCAL app.reinicio_institucional = 'on'`)
    if (syllabusIds.length === 0) return []
    const revisionIds = (
      await rowsOf<{ id: string }>(executor, Prisma.sql`select revision_silabo_id::text as id from revisiones_silabo where silabo_id in (${uuidList(syllabusIds)})`)
    ).map((row) => row.id)
    const exports =
      revisionIds.length === 0
        ? []
        : await rowsOf<{ object_id: string | null }>(
            executor,
            Prisma.sql`select archivo_pdf_id::text as object_id from exportaciones_silabo where revision_silabo_id in (${uuidList(revisionIds)})`,
          )
    const objectIds = [...new Set(exports.map((row) => row.object_id).filter((id): id is string => id !== null && id !== ""))]
    const objects =
      objectIds.length === 0
        ? []
        : await rowsOf<{ disk: string; path: string }>(executor, Prisma.sql`select disco as disk, ruta_archivo as path from archivos where archivo_id in (${uuidList(objectIds)})`)
    await executor.$executeRaw(Prisma.sql`delete from firmas_silabo where silabo_id in (${uuidList(syllabusIds)})`)
    if (revisionIds.length > 0) await executor.$executeRaw(Prisma.sql`delete from exportaciones_silabo where revision_silabo_id in (${uuidList(revisionIds)})`)
    if (objectIds.length > 0) await executor.$executeRaw(Prisma.sql`delete from archivos where archivo_id in (${uuidList(objectIds)})`)
    this.afterCommit(async () => {
      for (const object of objects) {
        try {
          await storageWriter().delete(object.disk, object.path)
        } catch {}
      }
    })
    if (revisionIds.length === 0) return []
    await executor.$executeRaw(Prisma.sql`delete from envios_biblioteca where revision_silabo_id in (${uuidList(revisionIds)})`)
    await executor.$executeRaw(Prisma.sql`delete from revisiones_coordinacion where revision_silabo_id in (${uuidList(revisionIds)})`)
    await executor.$executeRaw(Prisma.sql`delete from aprobaciones where revision_silabo_id in (${uuidList(revisionIds)})`)
    const ordered = await rowsOf<{ id: string }>(
      executor,
      Prisma.sql`select revision_silabo_id::text as id from revisiones_silabo where revision_silabo_id in (${uuidList(revisionIds)}) order by numero_revision desc`,
    )
    for (const row of ordered) await executor.$executeRaw(Prisma.sql`delete from revisiones_silabo where revision_silabo_id = ${row.id}::uuid`)
    return revisionIds
  }

  async deleteAggregates(syllabusIds: string[]): Promise<void> {
    const revisionIds = await this.clearHistory(syllabusIds)
    const resources = [...syllabusIds, ...revisionIds]
    if (resources.length > 0) await this.executor.$executeRaw(Prisma.sql`delete from notificaciones where recurso_id in (${uuidList(resources)})`)
    if (syllabusIds.length > 0) await this.executor.$executeRaw(Prisma.sql`delete from silabos where silabo_id in (${uuidList(syllabusIds)}) and ${SYLLABUS_ALIVE}`)
  }

  private async institutionalTemplate(): Promise<SyllabusTemplate> {
    if (this.template === undefined) this.template = await this.templates.template()
    if (this.template === null) throw new Missing(MODELS.template)
    return this.template
  }

  private async parallelRows(where: Prisma.Sql, careerId: string, lock: boolean): Promise<ParallelRow[]> {
    return rowsOf<ParallelRow>(
      this.executor,
      Prisma.sql`select paralelo.paralelo_id::text as id, paralelo.asignatura_id::text as subject_id, paralelo.codigo_paralelo as code, paralelo.jornada_paralelo as shift,
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
        order by paralelo.asignatura_id asc, paralelo.codigo_paralelo asc ${lock ? Prisma.sql`for update of paralelo` : Prisma.empty}`,
    )
  }

  async academicContext(parallel: ParallelRow, periodId: string): Promise<PhpRecord> {
    const subject = await loadSubjectContext(this.executor, parallel.subject_id)
    const [period] = await rowsOf<{ code: string; weeks: number | null }>(
      this.executor,
      Prisma.sql`select codigo_periodo_academico as code, cantidad_semanas_lectivas as weeks from periodos_academicos where periodo_academico_id = ${periodId}::uuid limit 1`,
    )
    if (subject === null || !period || parallel.modality === null) failServerError()
    return {
      ...subject,
      parallel: { id: parallel.id, code: parallel.code, shift: parallel.shift },
      scheduled_subject: { period: period.code, teaching_weeks: period.weeks === null ? null : Number(period.weeks), campus: parallel.campus, modality: parallel.modality },
    }
  }

  private async convocationPeriod(convocationId: string): Promise<{ careerId: string; periodId: string }> {
    const [row] = await rowsOf<{ career_id: string; period_id: string }>(
      this.executor,
      Prisma.sql`select convocatoria.carrera_id::text as career_id, proceso.periodo_academico_id::text as period_id
        from convocatorias_carreras convocatoria inner join convocatorias_universidad proceso on proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id
        where convocatoria.convocatoria_carrera_id = ${convocationId}::uuid limit 1`,
    )
    if (!row) failServerError()
    return { careerId: row.career_id, periodId: row.period_id }
  }

  private async generate(convocationId: string, periodId: string, parallel: ParallelRow): Promise<string> {
    const context = await this.academicContext(parallel, periodId)
    const id = uuid7()
    await this.executor.$executeRaw(Prisma.sql`insert into silabos (silabo_id, convocatoria_carrera_id, paralelo_id, datos_academicos_silabo, estado_silabo)
      values (${id}::uuid, ${convocationId}::uuid, ${parallel.id}::uuid, ${JSON.stringify(phpShape(context))}::jsonb, 'sin_iniciar')`)
    const template = await this.institutionalTemplate()
    const templates = await profileTemplates({ template, definition: template.definition!, store: this.templates }, parallel.subject_id)
    for (const field of templateFields(template)) {
      if (!isCareerField(field)) continue
      const value = templates[field.id] ?? field.content
      await this.executor.$executeRaw(Prisma.sql`insert into valores_campo (valor_campo_id, silabo_id, definicion_campo_id, valor_campo)
        values (${uuid7()}::uuid, ${id}::uuid, ${field.id}::uuid, ${JSON.stringify(phpShape(value))}::jsonb)`)
    }
    return id
  }

  async generateForParallel(convocationId: string, parallelId: string): Promise<string> {
    const { careerId, periodId } = await this.convocationPeriod(convocationId)
    const [parallel] = await this.parallelRows(Prisma.sql`paralelo.paralelo_id = ${parallelId}::uuid`, careerId, false)
    if (!parallel) failServerError()
    return this.generate(convocationId, periodId, parallel)
  }

  async generateConvocation(convocationId: string, options: GenerateOptions = {}): Promise<number> {
    const { careerId, periodId } = await this.convocationPeriod(convocationId)
    const filters = [Prisma.sql`asignatura.carrera_id = ${careerId}::uuid`, Prisma.sql`asignatura.asignatura_activa = true`, Prisma.sql`asignatura.genera_silabo_asignatura = true`]
    if (options.subjectId != null) filters.push(Prisma.sql`paralelo.asignatura_id = ${options.subjectId}::uuid`)
    if (options.subjectIds != null) filters.push(options.subjectIds.length === 0 ? Prisma.sql`false` : Prisma.sql`paralelo.asignatura_id in (${uuidList(options.subjectIds)})`)
    if (options.parallelId != null) filters.push(Prisma.sql`paralelo.paralelo_id = ${options.parallelId}::uuid`)
    const parallels = await this.parallelRows(Prisma.join(filters, " and "), careerId, true)
    if (parallels.length > 0) {
      await this.executor.$queryRaw(Prisma.sql`select asignacion_paralelo_id from asignaciones_paralelo where paralelo_id in (${uuidList(parallels.map((row) => row.id))})
        and asignacion_paralelo_activa = true for update`)
    }
    if (parallels.length === 0 && options.allowEmpty) return 0
    if (parallels.length === 0) throw new GenerationRejected({ convocation: ["No existen paralelos de la carrera."] })
    const covered = new Set(
      (
        await rowsOf<{ id: string }>(
          this.executor,
          Prisma.sql`select silabos.paralelo_id::text as id from silabos where silabos.convocatoria_carrera_id = ${convocationId}::uuid and ${SYLLABUS_ALIVE}`,
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
      const id = await this.generate(convocationId, periodId, parallel)
      if (options.notifyTeacher) await this.notifyAssigned(id, parallel, periodId)
      generated++
    }
    return generated
  }

  async restartSyllabus(syllabus: Pick<WorkSyllabus, "id" | "convocationId" | "parallelId">): Promise<string> {
    await this.deleteAggregates([syllabus.id])
    await this.generateForParallel(syllabus.convocationId, syllabus.parallelId)
    const [fresh] = await rowsOf<{ id: string }>(
      this.executor,
      Prisma.sql`select silabos.silabo_id::text as id from silabos where silabos.convocatoria_carrera_id = ${syllabus.convocationId}::uuid
        and silabos.paralelo_id = ${syllabus.parallelId}::uuid and ${SYLLABUS_ALIVE} limit 1`,
    )
    if (!fresh) failServerError()
    return fresh.id
  }
}
