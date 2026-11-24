import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { defaultBridgeDeps, requireSession } from "../auth/requireSession"
import type { BridgeDeps, LaravelSession } from "../auth/types"
import { laravelJson, validationError } from "../laravel/responses"
import { insertAuditEvent, type AuditEventInput } from "../operations/recordAuditEvent"
import { forbidden, isUuid } from "./structure"
import { findActiveCareer } from "./structureQueries"
import { laravelRouter, routeAllows } from "../laravel/router"

export interface DeletionTx {
  lockPeriod(id: string): Promise<{ id: string; code: string } | null>
  periodHasProcess(id: string): Promise<boolean>
  deletePeriod(id: string): Promise<void>
  lockTeacherAssignment(id: string, careerId: string): Promise<{ id: string } | null>
  deleteTeacherAssignment(id: string): Promise<void>
  lockParallel(id: string, careerId: string): Promise<{ id: string; code: string } | null>
  parallelHasTeacherAssignment(id: string): Promise<boolean>
  parallelHasTouchedSyllabus(id: string): Promise<boolean>
  deleteParallelSyllabi(id: string): Promise<void>
  deleteParallel(id: string): Promise<void>
  recordAudit(event: AuditEventInput): Promise<void>
}

export interface AcademicDeletionStore {
  careerActive(careerId: string): Promise<boolean>
  transaction<T>(work: (tx: DeletionTx) => Promise<T>): Promise<T>
}

export type AcademicDeletionDeps = { bridge: BridgeDeps; store: AcademicDeletionStore; now: () => number }

class RecordNotFound extends Error {}

class Rejected extends Error {
  constructor(readonly response: Response) {
    super("rejected")
  }
}

const SYLLABUS_SCOPE = sql`exists (select * from convocatorias_carreras where silabos.convocatoria_carrera_id = convocatorias_carreras.convocatoria_carrera_id
  and exists (select * from convocatorias_universidad where convocatorias_carreras.convocatoria_universidad_id = convocatorias_universidad.convocatoria_universidad_id))`

const IN_CAREER = (careerId: string) => sql`exists (select * from asignaturas where paralelos.asignatura_id = asignaturas.asignatura_id
  and asignaturas.carrera_id = ${careerId}::uuid)`

type Executor = { execute(query: SQL): Promise<{ rows: unknown[] }> }

async function first<T>(executor: Executor, query: SQL): Promise<T | null> {
  return ((await executor.execute(query)).rows[0] as T | undefined) ?? null
}

async function exists(executor: Executor, query: SQL): Promise<boolean> {
  return (await first<{ found: boolean }>(executor, sql`select exists (${query}) as found`))?.found === true
}

export function deletionTx(tx: Executor): DeletionTx {
  return {
    async lockPeriod(id) {
      const row = await first<{ id: string; code: string }>(tx, sql`select periodo_academico_id::text as id, codigo_periodo_academico as code
        from periodos_academicos where periodo_academico_id = ${id}::uuid limit 1 for update`)
      return row
    },
    periodHasProcess: (id) => exists(tx, sql`select * from convocatorias_universidad where periodo_academico_id = ${id}::uuid`),
    async deletePeriod(id) {
      await tx.execute(sql`delete from periodos_academicos where periodo_academico_id = ${id}::uuid`)
    },
    async lockTeacherAssignment(id, careerId) {
      return first<{ id: string }>(tx, sql`select asignaciones_paralelo.asignacion_paralelo_id::text as id from asignaciones_paralelo
        where exists (select * from paralelos where asignaciones_paralelo.paralelo_id = paralelos.paralelo_id and ${IN_CAREER(careerId)})
          and asignaciones_paralelo.asignacion_paralelo_id = ${id}::uuid limit 1 for update`)
    },
    async deleteTeacherAssignment(id) {
      await tx.execute(sql`delete from asignaciones_paralelo where asignacion_paralelo_id = ${id}::uuid`)
    },
    async lockParallel(id, careerId) {
      return first<{ id: string; code: string }>(tx, sql`select paralelos.paralelo_id::text as id, paralelos.codigo_paralelo as code from paralelos
        where paralelos.paralelo_id = ${id}::uuid and ${IN_CAREER(careerId)} limit 1 for update`)
    },
    parallelHasTeacherAssignment: (id) => exists(tx, sql`select * from asignaciones_paralelo where paralelo_id = ${id}::uuid`),
    parallelHasTouchedSyllabus: (id) =>
      exists(
        tx,
        sql`select * from silabos where paralelo_id = ${id}::uuid
          and (estado_silabo != 'sin_iniciar' or iniciado_en is not null
            or exists (select * from convocatorias_carreras where silabos.convocatoria_carrera_id = convocatorias_carreras.convocatoria_carrera_id
              and estado_convocatoria_carrera = 'cerrada'
              and exists (select * from convocatorias_universidad where convocatorias_carreras.convocatoria_universidad_id = convocatorias_universidad.convocatoria_universidad_id)))
          and ${SYLLABUS_SCOPE}`,
      ),
    async deleteParallelSyllabi(id) {
      await tx.execute(sql`delete from silabos where paralelo_id = ${id}::uuid and ${SYLLABUS_SCOPE}`)
    },
    async deleteParallel(id) {
      await tx.execute(sql`delete from paralelos where paralelo_id = ${id}::uuid`)
    },
    async recordAudit(event) {
      await insertAuditEvent(tx, event)
    },
  }
}

export function createAcademicDeletionStore(): AcademicDeletionStore {
  return {
    careerActive: async (careerId) => (await findActiveCareer(careerId)) !== null,
    transaction: (work) => db.transaction((tx) => work(deletionTx(tx as unknown as Executor))),
  }
}

function defaultDeps(): AcademicDeletionDeps {
  return { bridge: defaultBridgeDeps(), store: createAcademicDeletionStore(), now: () => Math.floor(Date.now() / 1000) }
}

function rejectWith(message: string): never {
  throw new Rejected(validationError({ record: [message] }))
}

async function inTransaction(request: Request, deps: AcademicDeletionDeps, work: (tx: DeletionTx) => Promise<void>, message: string): Promise<Response> {
  try {
    await deps.store.transaction(work)
  } catch (error) {
    if (error instanceof RecordNotFound) return deps.bridge.forward(request)
    if (error instanceof Rejected) return error.response
    throw error
  }
  return laravelJson({ message })
}

function audit(session: LaravelSession, deps: AcademicDeletionDeps, fields: Pick<AuditEventInput, "action" | "resourceType" | "resourceId" | "metadata">): AuditEventInput {
  return { actorId: session.user.id, roleAssignmentId: session.activeRole?.id ?? null, result: "exito", occurredAt: deps.now(), ...fields }
}

async function careerSession(request: Request, deps: AcademicDeletionDeps): Promise<{ session: LaravelSession; careerId: string } | Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  const role = session.activeRole
  if (!session.user.active || role?.role !== "coordinador" || role.careerId === null || !(await deps.store.careerActive(role.careerId))) return forbidden()
  return { session, careerId: role.careerId }
}

export async function deleteGovernanceRecord(
  request: Request,
  entity: string,
  recordId: string,
  deps: AcademicDeletionDeps = defaultDeps(),
): Promise<Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (!session.user.active || session.activeRole?.role !== "administrador") return forbidden()
  if (entity !== "periodo") return laravelJson({ message: "Este registro no se elimina: desactívelo." }, 403)
  if (!isUuid(recordId)) return deps.bridge.forward(request)

  return inTransaction(
    request,
    deps,
    async (tx) => {
      const period = await tx.lockPeriod(recordId)
      if (period === null) throw new RecordNotFound()
      if (await tx.periodHasProcess(period.id)) rejectWith("Este período ya tiene una convocatoria con su historial, por eso no se puede eliminar.")
      await tx.deletePeriod(period.id)
      await tx.recordAudit(audit(session, deps, { action: "academico.periodo.eliminacion", resourceType: "periodo", resourceId: recordId, metadata: { name: period.code } }))
    },
    "Registro institucional eliminado.",
  )
}

export async function deleteCareerRecord(
  request: Request,
  entity: string,
  recordId: string,
  deps: AcademicDeletionDeps = defaultDeps(),
): Promise<Response> {
  if (entity !== "asignacion_docente" || !routeAllows(request)) return laravelRouter(request)
  const context = await careerSession(request, deps)
  if (context instanceof Response) return context

  return inTransaction(
    request,
    deps,
    async (tx) => {
      const assignment = await tx.lockTeacherAssignment(recordId, context.careerId)
      if (assignment === null) throw new RecordNotFound()
      await tx.deleteTeacherAssignment(assignment.id)
      await tx.recordAudit(
        audit(context.session, deps, {
          action: "academico.asignacion_docente.eliminacion",
          resourceType: "asignacion_docente",
          resourceId: recordId,
          metadata: { name: assignment.id },
        }),
      )
    },
    "Registro académico eliminado.",
  )
}

export async function deleteParallel(request: Request, parallelId: string, deps: AcademicDeletionDeps = defaultDeps()): Promise<Response> {
  if (!routeAllows(request)) return laravelRouter(request)
  const context = await careerSession(request, deps)
  if (context instanceof Response) return context

  return inTransaction(
    request,
    deps,
    async (tx) => {
      const parallel = await tx.lockParallel(parallelId, context.careerId)
      if (parallel === null) throw new RecordNotFound()
      if (await tx.parallelHasTeacherAssignment(parallel.id)) rejectWith("El paralelo tiene un docente asignado. Quite primero la asignación docente.")
      if (await tx.parallelHasTouchedSyllabus(parallel.id)) rejectWith("El paralelo ya tiene sílabo y no puede eliminarse.")
      await tx.deleteParallelSyllabi(parallel.id)
      await tx.deleteParallel(parallel.id)
      await tx.recordAudit(
        audit(context.session, deps, { action: "academico.paralelo.eliminacion", resourceType: "paralelo", resourceId: parallelId, metadata: { name: parallel.code } }),
      )
    },
    "Paralelo eliminado.",
  )
}
