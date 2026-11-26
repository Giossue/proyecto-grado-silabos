import { HttpFailure, Missing } from "../http/failures"
import { MODELS } from "../http/models"
import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import { requireSession } from "../auth/requireSession"
import type { BridgeDeps, AppSession } from "../auth/types"
import { apiJson, serverError, validationError } from "../http/responses"
import { forbidden, isUuid } from "./structure"
import { IN_CAREER, SYLLABUS_SCOPE, TOUCHED_SYLLABUS } from "./academicSql"
import { unmatchedRoute, routeAllows } from "../http/router"

export interface DeletionTx {
  lockPeriod(id: string): Promise<{ id: string; code: string } | null>
  periodHasProcess(id: string): Promise<boolean>
  deletePeriod(id: string): Promise<void>
  lockTeacherAssignment(id: string, careerId: string): Promise<{ id: string } | null>
  deleteTeacherAssignment(id: string): Promise<void>
  lockParallel(id: string, careerId: string): Promise<{ id: string; code: string } | null>
  deleteParallelAssignments(id: string): Promise<void>
  parallelHasTouchedSyllabus(id: string): Promise<boolean>
  deleteParallelSyllabi(id: string): Promise<void>
  deleteParallel(id: string): Promise<void>
}

export interface AcademicDeletionStore {
  careerActive(careerId: string): Promise<boolean>
  transaction<T>(work: (tx: DeletionTx) => Promise<T>): Promise<T>
}

export type AcademicDeletionDeps = { bridge: BridgeDeps; store: AcademicDeletionStore }

class Rejected extends Error {
  constructor(readonly response: Response) {
    super("rejected")
  }
}

type Runner = Pick<Db, "$queryRaw" | "$executeRaw">

async function first<T>(runner: Runner, query: Prisma.Sql): Promise<T | null> {
  const rows = await runner.$queryRaw<T[]>(query)
  return rows[0] ?? null
}

async function exists(runner: Runner, query: Prisma.Sql): Promise<boolean> {
  return (await first<{ found: boolean }>(runner, Prisma.sql`select exists (${query}) as found`))?.found === true
}

export function deletionTx(tx: Runner): DeletionTx {
  return {
    lockPeriod: (id) =>
      first(tx, Prisma.sql`select periodo_academico_id::text as id, codigo_periodo_academico as code
        from periodos_academicos where periodo_academico_id = ${id}::uuid limit 1 for update`),
    periodHasProcess: (id) => exists(tx, Prisma.sql`select * from convocatorias_universidad where periodo_academico_id = ${id}::uuid`),
    async deletePeriod(id) {
      await tx.$executeRaw`delete from periodos_academicos where periodo_academico_id = ${id}::uuid`
    },
    lockTeacherAssignment: (id, careerId) =>
      first(tx, Prisma.sql`select asignaciones_paralelo.asignacion_paralelo_id::text as id from asignaciones_paralelo
        where exists (select * from paralelos where asignaciones_paralelo.paralelo_id = paralelos.paralelo_id and ${IN_CAREER(careerId)})
          and asignaciones_paralelo.asignacion_paralelo_id = ${id}::uuid limit 1 for update`),
    async deleteTeacherAssignment(id) {
      await tx.$executeRaw`delete from asignaciones_paralelo where asignacion_paralelo_id = ${id}::uuid`
    },
    lockParallel: (id, careerId) =>
      first(tx, Prisma.sql`select paralelos.paralelo_id::text as id, paralelos.codigo_paralelo as code from paralelos
        where paralelos.paralelo_id = ${id}::uuid and ${IN_CAREER(careerId)} limit 1 for update`),
    async deleteParallelAssignments(id) {
      await tx.$executeRaw`delete from asignaciones_paralelo where paralelo_id = ${id}::uuid`
    },
    parallelHasTouchedSyllabus: (id) => exists(tx, Prisma.sql`select * from silabos where paralelo_id = ${id}::uuid and ${TOUCHED_SYLLABUS} and ${SYLLABUS_SCOPE}`),
    async deleteParallelSyllabi(id) {
      await tx.$executeRaw`delete from silabos where paralelo_id = ${id}::uuid and ${SYLLABUS_SCOPE}`
    },
    async deleteParallel(id) {
      await tx.$executeRaw`delete from paralelos where paralelo_id = ${id}::uuid`
    },
  }
}

function rejectWith(message: string): never {
  throw new Rejected(validationError({ record: [message] }))
}

async function inTransaction(request: Request, deps: AcademicDeletionDeps, work: (tx: DeletionTx) => Promise<void>, message: string): Promise<Response> {
  try {
    await deps.store.transaction(work)
  } catch (error) {
    if (error instanceof HttpFailure) return error.response
    if (error instanceof Rejected) return error.response
    throw error
  }
  return apiJson({ message })
}

async function careerSession(request: Request, deps: AcademicDeletionDeps): Promise<{ session: AppSession; careerId: string } | Response> {
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
  deps: AcademicDeletionDeps,
): Promise<Response> {
  const session = await requireSession(request, { verified: true, activeRole: "required" }, deps.bridge)
  if (session instanceof Response) return session
  if (!session.user.active || session.activeRole?.role !== "administrador") return forbidden()
  if (entity !== "periodo") return apiJson({ message: "Este registro no se elimina: desactívelo." }, 403)
  if (!isUuid(recordId)) return serverError()

  return inTransaction(
    request,
    deps,
    async (tx) => {
      const period = await tx.lockPeriod(recordId)
      if (period === null) throw new Missing(MODELS.period, recordId)
      if (await tx.periodHasProcess(period.id)) rejectWith("Este periodo ya se abrió y tiene historial, por eso no se puede eliminar.")
      await tx.deletePeriod(period.id)
    },
    "Registro institucional eliminado.",
  )
}

export async function deleteCareerRecord(
  request: Request,
  entity: string,
  recordId: string,
  deps: AcademicDeletionDeps,
): Promise<Response> {
  if (entity !== "asignacion_docente" || !routeAllows(request)) return unmatchedRoute(request)
  const context = await careerSession(request, deps)
  if (context instanceof Response) return context

  return inTransaction(
    request,
    deps,
    async (tx) => {
      const assignment = await tx.lockTeacherAssignment(recordId, context.careerId)
      if (assignment === null) throw new Missing(MODELS.teacherAssignment, recordId)
      await tx.deleteTeacherAssignment(assignment.id)
    },
    "Registro académico eliminado.",
  )
}

export async function deleteParallel(request: Request, parallelId: string, deps: AcademicDeletionDeps): Promise<Response> {
  if (!routeAllows(request)) return unmatchedRoute(request)
  const context = await careerSession(request, deps)
  if (context instanceof Response) return context

  return inTransaction(
    request,
    deps,
    async (tx) => {
      const parallel = await tx.lockParallel(parallelId, context.careerId)
      if (parallel === null) throw new Missing(MODELS.parallel)
      if (await tx.parallelHasTouchedSyllabus(parallel.id)) rejectWith("El paralelo ya tiene sílabo y no puede eliminarse.")
      await tx.deleteParallelSyllabi(parallel.id)
      await tx.deleteParallelAssignments(parallel.id)
      await tx.deleteParallel(parallel.id)
    },
    "Paralelo eliminado.",
  )
}
