import { sql } from "drizzle-orm"
import { uuidList } from "../http/sql"
import { phpEquals, phpShape, type PhpRecord } from "../configuration/phpValues"
import { recipientsOn } from "../notifications/queries"
import { storeInternalNotifications } from "../notifications/store"
import { TEMPLATE_REDONE, workflowMessage } from "../notifications/workflowMessages"
import { decidedHandovers, returnApprovals } from "./coordinationHandover"
import { dataGet } from "./identificationCard"
import { InProgressWork, SYLLABUS_ALIVE } from "./inProgressWork"
import { SENT_STATES, type WorkSyllabus } from "./inProgressWorkHelpers"
import { rowsOf, type Executor } from "./teacherSyllabusQueries"

export const CLOSED_DOCUMENT = "closed_document"
const RESTARTED_WHEN_PARALLEL_CHANGES = ["en_revision", "aprobado"]
const EMPTY_COUNTS = ["sin_iniciar", "borrador", "en_revision", "correccion_solicitada", "aprobado"]

export type ReopenPlan = {
  period: boolean
  subjects: string[]
  teachers: string[]
  parallels: string[]
  handovers: string[]
  counts: { to_draft: number; restarted: number; to_coordination: number }
}

export type TemplateChange = { changedAt: string; key: string }

type PlannedSyllabus = WorkSyllabus & {
  careerId: string
  periodCode: string | null
  periodWeeks: number | null
  parallelCode: string | null
  parallelShift: string | null
  subjectId: string
  generates: boolean
}

type ActiveAssignment = { parallelId: string; assignedAfterClose: boolean; userId: string; email: string | null }

function dataGetOr(target: PhpRecord, path: string, fallback: unknown): unknown {
  let value: unknown = target
  for (const segment of path.split(".")) {
    if (!isKeyed(value) || !Object.prototype.hasOwnProperty.call(value, segment)) return fallback
    value = (value as Record<string, unknown>)[segment]
  }
  return value
}

function isKeyed(value: unknown): boolean {
  return typeof value === "object" && value !== null
}

function differs(stored: PhpRecord, path: string, current: unknown): boolean {
  return !phpEquals(dataGetOr(stored, path, current), current)
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

export async function templateChangedSince(executor: Executor, reference: "pausado_en" | "reopen", processId: string): Promise<TemplateChange | null> {
  const moment =
    reference === "pausado_en"
      ? sql`(select pausado_en from convocatorias_universidad where convocatoria_universidad_id = ${processId}::uuid)`
      : sql`(select coalesce(pausado_en, finalizada_en) from convocatorias_universidad where convocatoria_universidad_id = ${processId}::uuid)`
  const [row] = await rowsOf<{ changed_at: string | null; key: string | null }>(
    executor,
    sql`select plantilla.plantilla_modificada_en::text as changed_at,
        to_char(plantilla.plantilla_modificada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as key
      from (select plantilla_modificada_en from plantilla_silabo limit 1) plantilla
      where ${moment} is not null and plantilla.plantilla_modificada_en > ${moment}`,
  )
  return row && row.changed_at !== null && row.key !== null ? { changedAt: row.changed_at, key: row.key } : null
}

export async function processSyllabusCounts(executor: Executor, processId: string, toReopen: boolean): Promise<Record<string, number>> {
  const counts: Record<string, number> = Object.fromEntries(EMPTY_COUNTS.map((state) => [state, 0]))
  const scope = toReopen
    ? sql`convocatorias_carreras.estado_convocatoria_carrera = 'cerrada' and convocatorias_carreras.estado_previo_cierre_convocatoria_carrera is not null`
    : sql`convocatorias_carreras.estado_convocatoria_carrera in ('abierta', 'pausada')`
  const rows = await rowsOf<{ state: string; total: number }>(
    executor,
    sql`select silabos.estado_silabo as state, count(*)::int as total from silabos
      inner join convocatorias_carreras on convocatorias_carreras.convocatoria_carrera_id = silabos.convocatoria_carrera_id
      where convocatorias_carreras.convocatoria_universidad_id = ${processId}::uuid and ${scope} group by silabos.estado_silabo`,
  )
  for (const row of rows) counts[row.state] = Number(row.total)
  return counts
}

export async function adaptProcessToTemplate(work: InProgressWork, processId: string, change: TemplateChange): Promise<void> {
  const executor = work.executor
  const convocations = await rowsOf<{ id: string }>(
    executor,
    sql`select convocatoria_carrera_id::text as id from convocatorias_carreras where convocatoria_universidad_id = ${processId}::uuid
      and estado_convocatoria_carrera in ('abierta', 'pausada')
      and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id)
      order by convocatoria_carrera_id asc for update`,
  )
  const syllabi =
    convocations.length === 0
      ? []
      : await work.syllabi(sql`silabos.convocatoria_carrera_id in (${uuidList(convocations.map((row) => row.id))}) and ${SYLLABUS_ALIVE}`, { lock: true, ordered: true })
  const teacherIds = await recipientsOn(executor).teachersForProcess(processId)
  for (const syllabus of syllabi) await work.adaptToTemplate(syllabus)
  const [title, message] = workflowMessage(TEMPLATE_REDONE, null, null)
  if (work.notifications === undefined) throw new Error("InProgressWork needs a notification scope.")
  await storeInternalNotifications(work.notifications, {
    eventType: TEMPLATE_REDONE,
    deduplicationKey: `${TEMPLATE_REDONE}:${processId}:${change.key}`,
    recipientIds: teacherIds,
    title,
    message,
    resourceType: "proceso_silabos",
    resourceId: processId,
  })
}

export async function convocationsToReopen(executor: Executor, processId: string): Promise<string[]> {
  const rows = await rowsOf<{ id: string }>(
    executor,
    sql`select convocatoria_carrera_id::text as id from convocatorias_carreras where convocatoria_universidad_id = ${processId}::uuid
      and estado_convocatoria_carrera = 'cerrada' and estado_previo_cierre_convocatoria_carrera is not null
      and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id)
      order by convocatoria_carrera_id asc for update`,
  )
  return rows.map((row) => row.id)
}

export async function reopenProcess(work: InProgressWork, processId: string): Promise<string[]> {
  const executor = work.executor
  const convocations = await rowsOf<{ id: string; previous: string }>(
    executor,
    sql`select convocatoria_carrera_id::text as id, estado_previo_cierre_convocatoria_carrera as previous from convocatorias_carreras
      where convocatoria_universidad_id = ${processId}::uuid and estado_convocatoria_carrera = 'cerrada' and estado_previo_cierre_convocatoria_carrera is not null
      and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id)
      order by convocatoria_carrera_id asc for update`,
  )
  const ids = convocations.map((row) => row.id)
  const syllabi = ids.length === 0 ? [] : await work.syllabi(sql`silabos.convocatoria_carrera_id in (${uuidList(ids)}) and ${SYLLABUS_ALIVE}`, { lock: true, ordered: true })
  for (const syllabus of syllabi) {
    if (Object.prototype.hasOwnProperty.call(syllabus.context, CLOSED_DOCUMENT)) {
      const context = Object.fromEntries(Object.entries(syllabus.context).filter(([key]) => key !== CLOSED_DOCUMENT))
      await executor.execute(sql`update silabos set datos_academicos_silabo = ${JSON.stringify(phpShape(context))}::jsonb where silabo_id = ${syllabus.id}::uuid`)
    }
  }
  const reopened = convocations.filter((row) => row.previous === "abierta").map((row) => row.id)
  if (ids.length > 0) {
    await executor.execute(sql`update convocatorias_carreras set estado_convocatoria_carrera = estado_previo_cierre_convocatoria_carrera, estado_previo_cierre_convocatoria_carrera = null
      where convocatoria_carrera_id in (${uuidList(ids)})
        and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id)`)
  }
  await executor.execute(sql`update convocatorias_universidad set estado_convocatoria_universidad = 'abierto', finalizada_en = null, pausado_en = null
    where convocatoria_universidad_id = ${processId}::uuid`)
  return reopened
}

export class ReopenCatchUp {
  readonly executor: Executor

  constructor(
    readonly work: InProgressWork,
    readonly afterCommit: (callback: () => unknown) => void,
  ) {
    this.executor = work.executor
  }

  private async planned(convocationIds: string[]): Promise<PlannedSyllabus[]> {
    if (convocationIds.length === 0) return []
    const syllabi = await this.work.syllabi(sql`silabos.convocatoria_carrera_id in (${uuidList(convocationIds)}) and ${SYLLABUS_ALIVE}`, { lock: true, ordered: true })
    const planned: PlannedSyllabus[] = []
    for (const syllabus of syllabi) {
      const [row] = await rowsOf<{
        career_id: string
        period_code: string | null
        period_weeks: number | null
        parallel_code: string | null
        parallel_shift: string | null
        subject_id: string
        generates: boolean
      }>(
        this.executor,
        sql`select convocatoria.carrera_id::text as career_id, periodo.codigo_periodo_academico as period_code, periodo.cantidad_semanas_lectivas as period_weeks,
            paralelo.codigo_paralelo as parallel_code, paralelo.jornada_paralelo as parallel_shift, paralelo.asignatura_id::text as subject_id,
            (asignatura.asignatura_activa and asignatura.genera_silabo_asignatura) as generates
          from convocatorias_carreras convocatoria
            inner join convocatorias_universidad proceso on proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id
            inner join periodos_academicos periodo on periodo.periodo_academico_id = proceso.periodo_academico_id
            cross join paralelos paralelo inner join asignaturas asignatura on asignatura.asignatura_id = paralelo.asignatura_id
          where convocatoria.convocatoria_carrera_id = ${syllabus.convocationId}::uuid and paralelo.paralelo_id = ${syllabus.parallelId}::uuid limit 1`,
      )
      if (!row) throw new Error("syllabus without parallel or period")
      planned.push({
        ...syllabus,
        careerId: row.career_id,
        periodCode: row.period_code,
        periodWeeks: row.period_weeks === null ? null : Number(row.period_weeks),
        parallelCode: row.parallel_code,
        parallelShift: row.parallel_shift,
        subjectId: row.subject_id,
        generates: row.generates,
      })
    }
    return planned
  }

  private async assignments(parallelIds: string[], processId: string): Promise<Map<string, ActiveAssignment>> {
    const found = new Map<string, ActiveAssignment>()
    if (parallelIds.length === 0) return found
    const rows = await rowsOf<{ parallel_id: string; after_close: boolean | null; user_id: string; email: string | null }>(
      this.executor,
      sql`select asignacion.paralelo_id::text as parallel_id,
          asignacion.asignado_en >= date_trunc('second', (select finalizada_en from convocatorias_universidad where convocatoria_universidad_id = ${processId}::uuid)) as after_close,
          rol.usuario_id::text as user_id, usuario.correo_electronico as email
        from asignaciones_paralelo asignacion
          inner join asignaciones_rol rol on rol.asignacion_rol_id = asignacion.asignacion_rol_id
          left join usuarios usuario on usuario.usuario_id = rol.usuario_id
        where asignacion.paralelo_id in (${uuidList(parallelIds)}) and asignacion.asignacion_paralelo_activa = true`,
    )
    for (const row of rows) found.set(row.parallel_id, { parallelId: row.parallel_id, assignedAfterClose: row.after_close === true, userId: row.user_id, email: row.email })
    return found
  }

  private async teacherChanged(syllabus: PlannedSyllabus, assignment: ActiveAssignment | undefined, finalized: boolean): Promise<boolean> {
    if (assignment === undefined || !finalized || !assignment.assignedAfterClose) return false
    if (SENT_STATES.includes(syllabus.state)) {
      const [revision] = await rowsOf<{ author: string | null }>(
        this.executor,
        sql`select enviado_por::text as author from revisiones_silabo where silabo_id = ${syllabus.id}::uuid
          and exists (select 1 from silabos where silabos.silabo_id = revisiones_silabo.silabo_id and ${SYLLABUS_ALIVE}) order by numero_revision desc limit 1`,
      )
      const author = revision?.author ?? null
      return author !== null && author !== assignment.userId
    }
    return syllabus.state === "borrador" && dataGet(syllabus.context, `${CLOSED_DOCUMENT}.identification.email`) !== assignment.email
  }

  private async handovers(syllabi: PlannedSyllabus[], processId: string, finalized: boolean): Promise<string[]> {
    if (!finalized) return []
    const careers = unique(syllabi.map((syllabus) => syllabus.careerId))
    if (careers.length === 0) return []
    const rows = await rowsOf<{ id: string }>(
      this.executor,
      sql`select carrera_id::text as id from asignaciones_rol where rol = 'coordinador'
        and carrera_id in (${uuidList(careers)})
        and asignado_en >= date_trunc('second', (select finalizada_en from convocatorias_universidad where convocatoria_universidad_id = ${processId}::uuid))`,
    )
    return unique(rows.map((row) => row.id))
  }

  async plan(convocationIds: string[], processId: string, finalized: boolean): Promise<ReopenPlan> {
    const syllabi = await this.planned(convocationIds)
    const assignments = await this.assignments(
      syllabi.map((syllabus) => syllabus.parallelId),
      processId,
    )
    const period = syllabi.some(
      (syllabus) => differs(syllabus.context, "scheduled_subject.period", syllabus.periodCode) || differs(syllabus.context, "scheduled_subject.teaching_weeks", syllabus.periodWeeks),
    )
    const subjects = syllabi.filter((syllabus) => !syllabus.generates)
    const teachers: PlannedSyllabus[] = []
    for (const syllabus of syllabi) if (await this.teacherChanged(syllabus, assignments.get(syllabus.parallelId), finalized)) teachers.push(syllabus)
    const parallels = syllabi.filter(
      (syllabus) => differs(syllabus.context, "parallel.code", syllabus.parallelCode) || differs(syllabus.context, "parallel.shift", syllabus.parallelShift),
    )
    const restarted = period
      ? syllabi
      : [...subjects, ...teachers, ...parallels.filter((syllabus) => RESTARTED_WHEN_PARALLEL_CHANGES.includes(syllabus.state))].filter(
          (syllabus, index, all) => all.findIndex((other) => other.id === syllabus.id) === index,
        )
    const restartedIds = new Set(restarted.map((syllabus) => syllabus.id))
    const remaining = syllabi.filter((syllabus) => !restartedIds.has(syllabus.id))
    const toDraft = await this.work.returningToDraft(remaining)
    const handovers = await this.handovers(syllabi, processId, finalized)
    const toCoordination = remaining.filter((syllabus) => !toDraft.includes(syllabus.id)).filter((syllabus) => handovers.includes(syllabus.careerId))
    return {
      period,
      subjects: unique(subjects.map((syllabus) => syllabus.subjectId)),
      teachers: unique(teachers.map((syllabus) => syllabus.parallelId)),
      parallels: unique(parallels.map((syllabus) => syllabus.parallelId)),
      handovers,
      counts: {
        to_draft: toDraft.length,
        restarted: restarted.filter((syllabus) => syllabus.state !== "sin_iniciar" || syllabus.started).length,
        to_coordination: (await decidedHandovers(this.executor, toCoordination)).length,
      },
    }
  }

  async apply(plan: ReopenPlan, convocationIds: string[], periodId: string): Promise<void> {
    if (plan.period) await this.work.regenerate({ periodId }, "cambió el período académico", true)
    if (plan.subjects.length > 0) await this.work.regenerate({ subjectIds: plan.subjects }, "la materia dejó de generar sílabo", true)
    for (const parallelId of plan.teachers) await this.work.restartForParallel(parallelId)
    for (const parallelId of plan.parallels) await this.work.restartSentForParallel(parallelId)
    const careers =
      convocationIds.length === 0
        ? []
        : (
            await rowsOf<{ id: string }>(
              this.executor,
              sql`select carrera_id::text as id from convocatorias_carreras where convocatoria_carrera_id in (${uuidList(convocationIds)})
                and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id)`,
            )
          ).map((row) => row.id)
    await this.work.catchUp(careers)
    for (const parallelId of plan.parallels) await this.work.refreshParallel(parallelId)
    for (const careerId of plan.handovers) await returnApprovals(this.executor, this.afterCommit, careerId, (where) => this.work.syllabi(where, { lock: true }))
  }
}
