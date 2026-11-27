import { Prisma } from "../../generated/prisma/client"
import { uuidList } from "../../prisma/sql"
import { phpEquals, type PhpRecord } from "../configuration/phpValues"
import { decidedHandovers } from "./coordinationHandover"
import { institutionalTemplateProblem } from "./convocationWriteStore"
import { dataGet } from "./identificationCard"
import { idsIn, InProgressWork, SYLLABUS_ALIVE } from "./inProgressWork"
import { DOCUMENT_PATHS, GenerationRejected } from "./inProgressWorkHelpers"
import { openCurriculum } from "./syllabusSql"
import { rowsOf, type Executor } from "./teacherSyllabusQueries"

export const FINALIZED_MODE = "convocatoria_finalizada"
export const ANOTHER_IN_PROGRESS = "Hay otro proceso de sílabos en curso; finalícelo o elimínelo antes de reabrir este"
export const TEMPLATE_NOT_READY = "La plantilla no está lista para usarse. Complétela; «Antes de empezar» indica qué falta."
export const MAX_EXTENSIONS = 2
const REOPEN_PATHS = ["parallel.code", "parallel.shift", "scheduled_subject.period", "scheduled_subject.teaching_weeks"]

export type ExtensibleProcess = { id: string; state: string; dueAt: number; extensions: number; periodEndsOn: string }

export function institutionDay(seconds: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(seconds * 1000),
  )
}

export function displayDay(day: string): string {
  const [year, month, date] = day.split("-")
  return `${date}/${month}/${year}`
}

export async function anotherProcessInProgress(executor: Executor, processId: string, lock = false): Promise<boolean> {
  const rows = await rowsOf<{ id: string }>(
    executor,
    Prisma.sql`select convocatoria_universidad_id::text as id from convocatorias_universidad where estado_convocatoria_universidad in ('abierto', 'pausado')
      and convocatoria_universidad_id <> ${processId}::uuid ${lock ? Prisma.sql`for update` : Prisma.sql`limit 1`}`,
  )
  return rows.length > 0
}

export type ReopenFacts = { anotherInProgress(processId: string): Promise<boolean>; templateProblem(): Promise<string | null> }

export function reopenFactsOn(executor: Executor): ReopenFacts {
  return { anotherInProgress: (processId) => anotherProcessInProgress(executor, processId), templateProblem: () => institutionalTemplateProblem(executor, "process") }
}

export async function deadlineBlockReason(facts: ReopenFacts, process: ExtensibleProcess, now: number): Promise<string | null> {
  if (process.extensions >= MAX_EXTENSIONS) return `Ya se usaron las ${MAX_EXTENSIONS} prórrogas de este proceso de sílabos.`
  const limitOn = process.periodEndsOn
  if (institutionDay(process.dueAt) >= limitOn) return `El plazo ya llega al último día de clases (${displayDay(limitOn)}).`
  if (limitOn < institutionDay(now)) return `Las clases del período terminaron el ${displayDay(limitOn)}.`
  if (process.state === "cerrado" && (await facts.anotherInProgress(process.id))) return ANOTHER_IN_PROGRESS
  if (process.state === "cerrado" && (await facts.templateProblem()) !== null) return TEMPLATE_NOT_READY
  return null
}

type ReopenableConvocation = { id: string; period: string }

export class FinalizedChangeNotice {
  readonly executor: Executor

  constructor(
    readonly work: InProgressWork,
    readonly now: number,
  ) {
    this.executor = work.executor
  }

  async guard<T>(confirmed: boolean, careerIds: string | string[] | null, change: () => Promise<T>, subjectIds: string[] | null = null, periodId: string | null = null): Promise<T> {
    const convocations = confirmed ? [] : await this.reopenable(careerIds, periodId)
    if (convocations.length === 0) return change()
    const ids = convocations.map((convocation) => convocation.id)
    const before = await this.reaching(ids, subjectIds)
    const result = await change()
    if (!phpEquals(await this.reaching(ids, subjectIds), before)) throw this.warning(convocations)
    return result
  }

  async guardHandover(confirmed: boolean, careerId: string): Promise<void> {
    const convocations = confirmed ? [] : await this.reopenable(careerId, null)
    if (convocations.length === 0) return
    const syllabi = await this.work.syllabi(Prisma.sql`silabos.convocatoria_carrera_id in (${uuidList(convocations.map((convocation) => convocation.id))}) and ${SYLLABUS_ALIVE}`)
    if ((await decidedHandovers(this.executor, syllabi)).length > 0) throw this.warning(convocations)
  }

  private async reopenable(careerIds: string | string[] | null, periodId: string | null): Promise<ReopenableConvocation[]> {
    if (careerIds === null && periodId === null) return []
    const today = institutionDay(this.now)
    const processes = await rowsOf<{ id: string; state: string; due_at: number; extensions: number; ends_on: string }>(
      this.executor,
      Prisma.sql`select proceso.convocatoria_universidad_id::text as id, proceso.estado_convocatoria_universidad as state, extract(epoch from proceso.fecha_entrega)::bigint as due_at,
          proceso.cantidad_prorrogas as extensions, to_char(periodo.fecha_fin_periodo, 'YYYY-MM-DD') as ends_on
        from convocatorias_universidad proceso inner join periodos_academicos periodo on periodo.periodo_academico_id = proceso.periodo_academico_id
        where proceso.estado_convocatoria_universidad = 'cerrado' and periodo.fecha_fin_periodo >= ${today}::date
          and not exists (select 1 from convocatorias_universidad posterior
            inner join periodos_academicos periodo_posterior on periodo_posterior.periodo_academico_id = posterior.periodo_academico_id
            where posterior.convocatoria_universidad_id <> proceso.convocatoria_universidad_id
              and (posterior.estado_convocatoria_universidad in ('abierto', 'pausado') or periodo_posterior.fecha_inicio_periodo > periodo.fecha_inicio_periodo))
          ${periodId === null ? Prisma.empty : Prisma.sql`and proceso.periodo_academico_id = ${periodId}::uuid`}`,
    )
    const reopenable: string[] = []
    for (const process of processes) {
      const reason = await deadlineBlockReason(
        reopenFactsOn(this.executor),
        { id: process.id, state: process.state, dueAt: Number(process.due_at), extensions: Number(process.extensions), periodEndsOn: process.ends_on },
        this.now,
      )
      if (reason === null || reason === TEMPLATE_NOT_READY) reopenable.push(process.id)
    }
    if (reopenable.length === 0) return []
    const careers =
      typeof careerIds === "string" ? Prisma.sql`and convocatoria.carrera_id = ${careerIds}::uuid` : Array.isArray(careerIds) ? Prisma.sql`and ${idsIn(Prisma.sql`convocatoria.carrera_id`, careerIds)}` : Prisma.empty
    return rowsOf<ReopenableConvocation>(
      this.executor,
      Prisma.sql`select convocatoria.convocatoria_carrera_id::text as id, periodo.codigo_periodo_academico as period
        from convocatorias_carreras convocatoria
          inner join convocatorias_universidad proceso on proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id
          inner join periodos_academicos periodo on periodo.periodo_academico_id = proceso.periodo_academico_id
        where convocatoria.convocatoria_universidad_id in (${uuidList(reopenable)}) and convocatoria.estado_convocatoria_carrera = 'cerrado'
          and convocatoria.estado_previo_cierre_convocatoria_carrera is not null ${careers}
        order by convocatoria.convocatoria_carrera_id asc`,
    )
  }

  private async reaching(convocationIds: string[], subjectIds: string[] | null): Promise<PhpRecord> {
    const periods = new Map(
      (
        await rowsOf<{ id: string; period_id: string }>(
          this.executor,
          Prisma.sql`select convocatoria.convocatoria_carrera_id::text as id, proceso.periodo_academico_id::text as period_id from convocatorias_carreras convocatoria
            inner join convocatorias_universidad proceso on proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id
            where convocatoria.convocatoria_carrera_id in (${uuidList(convocationIds)})`,
        )
      ).map((row) => [row.id, row.period_id]),
    )
    const subjects = subjectIds === null ? Prisma.empty : Prisma.sql`and exists (select 1 from paralelos materia where materia.paralelo_id = silabos.paralelo_id and ${idsIn(Prisma.sql`materia.asignatura_id`, subjectIds)})`
    const syllabi = await this.work.syllabi(Prisma.sql`silabos.convocatoria_carrera_id in (${uuidList(convocationIds)}) ${subjects} and ${SYLLABUS_ALIVE}`, { ordered: true })
    const reaching: PhpRecord = {}
    const profiles = new Map<string, PhpRecord>()
    for (const syllabus of syllabi) {
      const periodId = periods.get(syllabus.convocationId)
      if (periodId === undefined) continue
      const built = await this.work.contextOf(syllabus.parallelId, periodId)
      if (built === null) continue
      const { parallel, context } = built
      if (!profiles.has(parallel.subject_id)) {
        profiles.set(parallel.subject_id, Object.fromEntries((await this.work.profilesFor([parallel.subject_id])).get(parallel.subject_id) ?? new Map()))
      }
      const [facts] = await rowsOf<{ teacher: string | null; generates: boolean }>(
        this.executor,
        Prisma.sql`select (select asignacion.asignacion_paralelo_id::text from asignaciones_paralelo asignacion where asignacion.paralelo_id = ${parallel.id}::uuid
              and asignacion.asignacion_paralelo_activa = true limit 1) as teacher,
            (asignatura.asignatura_activa and asignatura.genera_silabo_asignatura) as generates
          from asignaturas asignatura where asignatura.asignatura_id = ${parallel.subject_id}::uuid`,
      )
      reaching[syllabus.id] = {
        context: [...DOCUMENT_PATHS, ...REOPEN_PATHS].map((path) => dataGet(context, path)),
        profile: profiles.get(parallel.subject_id),
        teacher: facts?.teacher ?? null,
        generates: facts?.generates === true,
      }
    }
    for (const convocationId of convocationIds) reaching[`nuevos:${convocationId}`] = await this.parallelsWithoutSyllabus(convocationId, subjectIds)
    return reaching
  }

  private async parallelsWithoutSyllabus(convocationId: string, subjectIds: string[] | null): Promise<string[]> {
    const rows = await rowsOf<{ id: string }>(
      this.executor,
      Prisma.sql`select paralelo.paralelo_id::text as id from paralelos paralelo
        where exists (select 1 from asignaturas asignatura where asignatura.asignatura_id = paralelo.asignatura_id
            and asignatura.carrera_id = (select carrera_id from convocatorias_carreras where convocatoria_carrera_id = ${convocationId}::uuid)
            and asignatura.asignatura_activa = true and asignatura.genera_silabo_asignatura = true and ${openCurriculum("asignatura")})
          and exists (select 1 from asignaciones_paralelo asignacion where asignacion.paralelo_id = paralelo.paralelo_id and asignacion.asignacion_paralelo_activa = true)
          ${subjectIds === null ? Prisma.empty : Prisma.sql`and ${idsIn(Prisma.sql`paralelo.asignatura_id`, subjectIds)}`}
          and paralelo.paralelo_id not in (select silabos.paralelo_id from silabos where silabos.convocatoria_carrera_id = ${convocationId}::uuid and ${SYLLABUS_ALIVE})
        order by paralelo.paralelo_id asc`,
    )
    return rows.map((row) => row.id)
  }

  private warning(convocations: ReopenableConvocation[]): GenerationRejected {
    const period = convocations[0].period
    return new GenerationRejected({
      purge_required: [
        `El proceso de sílabos del periodo ${period} ya finalizó. Este cambio no afecta sus sílabos: conservan los datos que tenían. Se aplicará en el próximo proceso de sílabos, o en este si lo reabre con una prórroga. Evite estos cambios hasta abrir el próximo proceso de sílabos, salvo que sea necesario.`,
      ],
      purge_count: ["0"],
      purge_mode: [FINALIZED_MODE],
    })
  }
}

export async function keepContent<T>(work: InProgressWork, confirmed: boolean, careerId: string, change: () => Promise<T>, subjectIds: string[] | null = null): Promise<T> {
  const subjects = await work.subjectsInProgress(careerId, subjectIds)
  const before = await work.profilesFor(subjects)
  const result = await new FinalizedChangeNotice(work, work.notifications?.now ?? Math.floor(Date.now() / 1000)).guard(confirmed, careerId, change)
  await work.sync(confirmed, careerId, subjectIds, before)
  return result
}
