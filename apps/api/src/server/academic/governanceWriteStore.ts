import { and, eq, exists, isNull, ne, sql, type SQL } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { db } from "@/db"
import { byColumnName, hasRows, jsonText } from "@/db/expressions"
import {
  asignacionesParalelo,
  asignacionesRol,
  carreras,
  convocatoriasCarreras,
  convocatoriasUniversidad,
  facultades,
  invitacionesActivacion,
  periodosAcademicos,
} from "@/db/schema"
import { sesionesUsuario } from "@/db/schema/auth"
import { uuid7 } from "../http/uuid7"
import { systemNow } from "../shared/clock"
import { notificationScope, type WriteOptions } from "../notifications/queries"
import { withAfterCommit, type AfterCommit } from "../queue/dispatch"
import { FinalizedChangeNotice } from "../syllabus/finalizedChangeNotice"
import { InProgressWork } from "../syllabus/inProgressWork"
import { dbTransaction, type TransactionRunner } from "../syllabus/reviewDecisionStore"
import type { Executor } from "../syllabus/teacherSyllabusQueries"
import type { GovernanceWriteDeps, GovernanceWriteTx } from "./governanceWrites"
import { insertStoredObject } from "./supportDocumentWriteStore"

const convocatoria = alias(convocatoriasCarreras, "convocatoria")
const proceso = alias(convocatoriasUniversidad, "proceso")
const TABLES = { facultad: [facultades, facultades.facultadId], carrera: [carreras, carreras.carreraId], periodo: [periodosAcademicos, periodosAcademicos.periodoAcademicoId] } as const
const PERIOD = {
  id: periodosAcademicos.periodoAcademicoId,
  code: periodosAcademicos.codigoPeriodoAcademico,
  startsOn: periodosAcademicos.fechaInicioPeriodo,
  endsOn: periodosAcademicos.fechaFinPeriodo,
  weeks: periodosAcademicos.cantidadSemanasLectivas,
}

function processWhere(executor: Executor, ...conditions: (SQL | undefined)[]): SQL {
  return exists(
    executor
      .select({ id: proceso.convocatoriaUniversidadId })
      .from(proceso)
      .where(and(eq(proceso.convocatoriaUniversidadId, convocatoria.convocatoriaUniversidadId), ...conditions)),
  )
}

function convocationExists(executor: Executor, ...conditions: (SQL | undefined)[]): Promise<boolean> {
  return hasRows(executor.select({ id: convocatoria.convocatoriaCarreraId }).from(convocatoria).where(and(...conditions, processWhere(executor))).limit(1))
}

export function governanceWriteTx(executor: Executor, afterCommit: AfterCommit, now: number, options: WriteOptions = {}): GovernanceWriteTx {
  const work = new InProgressWork(executor, afterCommit, notificationScope(executor, afterCommit, now, options.mail))
  const notice = new FinalizedChangeNotice(work, now)
  return {
    async createCareer(data) {
      const id = uuid7()
      await executor.insert(carreras).values({
        carreraId: id,
        facultadId: data.facultyId,
        codigoCarrera: data.code,
        nombreCarrera: data.name,
        carreraActiva: true,
        modalidadCarrera: data.modality as typeof carreras.$inferInsert.modalidadCarrera,
        numeroCiclos: data.cycleCount,
      })
      return id
    },
    async createFaculty(data) {
      const id = uuid7()
      await executor
        .insert(facultades)
        .values({ facultadId: id, nombreFacultad: data.name, campusFacultad: data.campus, bibliotecasKohaFacultad: data.libraries, facultadActiva: true })
      return id
    },
    insertObject: (row) => insertStoredObject(executor, row),
    async createPeriod(data) {
      const id = uuid7()
      await executor.insert(periodosAcademicos).values({
        periodoAcademicoId: id,
        codigoPeriodoAcademico: data.code,
        fechaInicioPeriodo: data.startsOn,
        fechaFinPeriodo: data.endsOn,
        cantidadSemanasLectivas: data.weeks,
      })
      return id
    },
    async lockFaculty(id) {
      const [row] = await executor
        .select({ id: facultades.facultadId, name: facultades.nombreFacultad, campus: facultades.campusFacultad, libraries: jsonText(facultades.bibliotecasKohaFacultad) })
        .from(facultades)
        .where(eq(facultades.facultadId, id))
        .limit(1)
        .for("update")
      return row ?? null
    },
    async lockCareer(id) {
      const [row] = await executor
        .select({ id: carreras.carreraId, facultyId: carreras.facultadId, code: carreras.codigoCarrera, name: carreras.nombreCarrera, modality: carreras.modalidadCarrera })
        .from(carreras)
        .where(eq(carreras.carreraId, id))
        .limit(1)
        .for("update")
      return row ?? null
    },
    async lockPeriod(id) {
      const [row] = await executor.select(PERIOD).from(periodosAcademicos).where(eq(periodosAcademicos.periodoAcademicoId, id)).limit(1).for("update")
      return row ? { ...row, weeks: row.weeks === null ? null : Number(row.weeks) } : null
    },
    async lockActiveFaculty(id) {
      const [row] = await executor.select({ active: facultades.facultadActiva }).from(facultades).where(eq(facultades.facultadId, id)).limit(1).for("update")
      return row?.active === true
    },
    async careersOfFaculty(facultyId) {
      const rows = await executor.select({ id: carreras.carreraId }).from(carreras).where(eq(carreras.facultadId, facultyId))
      return rows.map((row) => row.id)
    },
    periodRunning: (periodId) =>
      convocationExists(
        executor,
        eq(convocatoria.estadoConvocatoriaCarrera, "abierta"),
        processWhere(executor, eq(proceso.estadoConvocatoriaUniversidad, "abierto")),
        processWhere(executor, eq(proceso.periodoAcademicoId, periodId)),
      ),
    async updateColumns(entity, id, columns) {
      const [table, key] = TABLES[entity]
      await executor.update(table).set(byColumnName(table, columns)).where(eq(key, id))
    },
    facultyHasActiveCareers: (id) =>
      hasRows(executor.select({ id: carreras.carreraId }).from(carreras).where(and(eq(carreras.facultadId, id), eq(carreras.carreraActiva, true))).limit(1)),
    careerInProgress: (id) =>
      convocationExists(
        executor,
        eq(convocatoria.carreraId, id),
        ne(convocatoria.estadoConvocatoriaCarrera, "cerrada"),
        processWhere(executor, ne(proceso.estadoConvocatoriaUniversidad, "cerrado")),
      ),
    async retireCareerUsers(id) {
      const assignments = await executor
        .select({ id: asignacionesRol.asignacionRolId, userId: asignacionesRol.usuarioId })
        .from(asignacionesRol)
        .where(and(eq(asignacionesRol.carreraId, id), eq(asignacionesRol.asignacionRolActiva, true)))
        .for("update")
      for (const assignment of assignments) {
        await executor
          .delete(asignacionesParalelo)
          .where(and(eq(asignacionesParalelo.asignacionRolId, assignment.id), eq(asignacionesParalelo.asignacionParaleloActiva, true)))
        await executor.update(asignacionesRol).set({ asignacionRolActiva: false }).where(eq(asignacionesRol.asignacionRolId, assignment.id))
        await executor.delete(sesionesUsuario).where(eq(sesionesUsuario.userId, assignment.userId))
        const stillActive = await hasRows(
          executor
            .select({ id: asignacionesRol.asignacionRolId })
            .from(asignacionesRol)
            .where(and(eq(asignacionesRol.usuarioId, assignment.userId), eq(asignacionesRol.asignacionRolActiva, true)))
            .limit(1),
        )
        if (!stillActive) {
          await executor
            .update(invitacionesActivacion)
            .set({ invalidadaEn: sql`now()` })
            .where(and(eq(invitacionesActivacion.usuarioId, assignment.userId), isNull(invitacionesActivacion.usadaEn), isNull(invitacionesActivacion.invalidadaEn)))
        }
      }
      return assignments.length
    },
    async setActive(entity, id, active) {
      if (entity === "facultad") await executor.update(facultades).set({ facultadActiva: active }).where(eq(facultades.facultadId, id))
      else await executor.update(carreras).set({ carreraActiva: active }).where(eq(carreras.carreraId, id))
    },
    replace: (confirmed, change, periodId) => (periodId === null ? change() : work.replace(confirmed, change, { periodId })),
    guard: (confirmed, careerIds, change, periodId) => notice.guard(confirmed, careerIds, change, null, periodId),
    async sync(confirmed, careerIds) {
      await work.sync(confirmed, careerIds)
    },
  }
}

export function governanceWriteDepsOn(executor: Executor, transaction: TransactionRunner, options: WriteOptions = {}): Omit<GovernanceWriteDeps, "bridge"> {
  const now = options.now ?? systemNow
  return {
    now,
    activeFacultyExists: (id) =>
      hasRows(executor.select({ id: facultades.facultadId }).from(facultades).where(and(eq(facultades.facultadId, id), eq(facultades.facultadActiva, true))).limit(1)),
    facultyExists: (id) => hasRows(executor.select({ id: facultades.facultadId }).from(facultades).where(eq(facultades.facultadId, id)).limit(1)),
    careerCodeTaken: (code, except) =>
      hasRows(
        executor
          .select({ id: carreras.carreraId })
          .from(carreras)
          .where(and(eq(carreras.codigoCarrera, code), except === null ? undefined : sql`${carreras.carreraId}::text <> ${except}`))
          .limit(1),
      ),
    transaction: (work) => withAfterCommit((afterCommit) => transaction((inner) => work(governanceWriteTx(inner, afterCommit, now(), options)))),
  }
}

export function createGovernanceWriteDeps(): Omit<GovernanceWriteDeps, "bridge"> {
  return governanceWriteDepsOn(db as unknown as Executor, dbTransaction)
}
