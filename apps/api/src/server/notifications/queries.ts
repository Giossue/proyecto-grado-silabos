import { and, eq, exists, inArray, isNotNull, notInArray, sql, type SQL } from "drizzle-orm"
import type { AnyPgColumn } from "drizzle-orm/pg-core"
import { fromEpoch, jsonText } from "@/db/expressions"
import {
  asignacionesRol,
  asignaturas,
  carreras,
  convocatoriasCarreras,
  convocatoriasUniversidad,
  docentesVigentesSilabo,
  exportacionesSilabo,
  notificaciones,
  paralelos,
  revisionesSilabo,
  silabos,
  usuarios,
} from "@/db/schema"
import { frontendUrl } from "../mail/config"
import { queueMail } from "../mail/sendMailJob"
import { uuid7 } from "../http/uuid7"
import type { QueuedMail } from "../mail/mailables"
import type { AfterCommit } from "../queue/dispatch"
import { phpJsonDecode } from "../configuration/phpValues"
import type { Executor } from "../syllabus/teacherSyllabusQueries"
import { notificationEmailConfig } from "./config"
import type { NotificationScope, NotificationTx } from "./store"

const SYLLABUS_ALIVE = sql`exists (select 1 from convocatorias_carreras vivo where vivo.convocatoria_carrera_id = silabos.convocatoria_carrera_id
  and exists (select 1 from convocatorias_universidad vivo_proceso where vivo_proceso.convocatoria_universidad_id = vivo.convocatoria_universidad_id))`

async function firstValue(query: PromiseLike<{ value: string | null }[]>): Promise<string | null> {
  const [row] = await query
  return row?.value ?? null
}

function processAlive(executor: Executor): SQL {
  return exists(
    executor
      .select({ id: convocatoriasUniversidad.convocatoriaUniversidadId })
      .from(convocatoriasUniversidad)
      .where(eq(convocatoriasUniversidad.convocatoriaUniversidadId, convocatoriasCarreras.convocatoriaUniversidadId)),
  )
}

async function processOfSyllabus(executor: Executor, syllabusId: string | null): Promise<string | null> {
  if (syllabusId === null) return null
  const convocationId = await firstValue(
    executor
      .select({ value: silabos.convocatoriaCarreraId })
      .from(silabos)
      .where(and(eq(silabos.silaboId, syllabusId), SYLLABUS_ALIVE))
      .limit(1),
  )
  return convocationId === null ? null : processOfConvocation(executor, convocationId)
}

function processOfConvocation(executor: Executor, convocationId: string): Promise<string | null> {
  return firstValue(
    executor
      .select({ value: convocatoriasCarreras.convocatoriaUniversidadId })
      .from(convocatoriasCarreras)
      .where(and(eq(convocatoriasCarreras.convocatoriaCarreraId, convocationId), processAlive(executor)))
      .limit(1),
  )
}

export function notificationTx(executor: Executor): NotificationTx {
  return {
    async recipients(ids) {
      const rows = await executor
        .select({
          id: usuarios.usuarioId,
          name: usuarios.nombreUsuario,
          email: usuarios.correoElectronico,
          verified: isNotNull(usuarios.correoVerificadoEn).mapWith(Boolean),
          preferences: jsonText(usuarios.preferenciasCorreoUsuario),
        })
        .from(usuarios)
        .where(and(inArray(usuarios.usuarioId, ids), eq(usuarios.usuarioActivo, true)))
      return rows.map((row) => ({ ...row, preferences: phpJsonDecode(row.preferences) }))
    },
    async periodOf(resourceType, resourceId) {
      let processId: string | null = null
      if (resourceType === "proceso_silabos") processId = resourceId
      else if (resourceType === "convocatoria") processId = await processOfConvocation(executor, resourceId)
      else if (resourceType === "silabo") processId = await processOfSyllabus(executor, resourceId)
      else if (resourceType === "artefacto_exportacion") {
        const syllabusId = await firstValue(
          executor
            .select({ value: revisionesSilabo.silaboId })
            .from(exportacionesSilabo)
            .innerJoin(revisionesSilabo, eq(revisionesSilabo.revisionSilaboId, exportacionesSilabo.revisionSilaboId))
            .where(eq(exportacionesSilabo.exportacionSilaboId, resourceId))
            .limit(1),
        )
        processId = await processOfSyllabus(executor, syllabusId)
      }
      if (processId === null) return null
      return firstValue(
        executor
          .select({ value: convocatoriasUniversidad.periodoAcademicoId })
          .from(convocatoriasUniversidad)
          .where(eq(convocatoriasUniversidad.convocatoriaUniversidadId, processId))
          .limit(1),
      )
    },
    async create(row) {
      const inserted = await executor
        .insert(notificaciones)
        .values({
          notificacionId: uuid7(),
          usuarioId: row.userId,
          claveUnica: row.key,
          tipoNotificacion: row.type,
          tituloNotificacion: row.title,
          mensajeNotificacion: row.message,
          tipoRecurso: row.resourceType,
          recursoId: row.resourceId,
          periodoAcademicoId: row.periodId,
          notificadoEn: fromEpoch(row.notifiedAt),
        })
        .onConflictDoNothing({ target: [notificaciones.usuarioId, notificaciones.claveUnica] })
        .returning({ id: notificaciones.notificacionId })
      return inserted.length > 0
    },
    subjectOf(syllabusId) {
      return firstValue(
        executor
          .select({ value: asignaturas.nombreAsignatura })
          .from(silabos)
          .innerJoin(paralelos, eq(paralelos.paraleloId, silabos.paraleloId))
          .innerJoin(asignaturas, eq(asignaturas.asignaturaId, paralelos.asignaturaId))
          .where(eq(silabos.silaboId, syllabusId))
          .limit(1),
      )
    },
  }
}

export type Mail = (mail: QueuedMail) => Promise<unknown>

export type WriteOptions = { now?: () => number; mail?: Mail }

export const systemNow = () => Math.floor(Date.now() / 1000)

export function notificationScope(executor: Executor, afterCommit: AfterCommit, now: number, mail: Mail = queueMail): NotificationScope {
  return { tx: notificationTx(executor), afterCommit, mail, now, email: notificationEmailConfig(), frontendUrl: frontendUrl() }
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

async function ids(query: PromiseLike<{ id: string | null }[]>): Promise<string[]> {
  return unique((await query).map((row) => row.id).filter((id): id is string => typeof id === "string"))
}

function activeUser(executor: Executor, user: AnyPgColumn): SQL {
  return exists(executor.select({ id: usuarios.usuarioId }).from(usuarios).where(and(eq(usuarios.usuarioId, user), eq(usuarios.usuarioActivo, true))))
}

export type Recipients = {
  teachersFor(syllabusId: string): Promise<string[]>
  teacherSyllabusCounts(convocationIds: string[], exceptStates?: string[]): Promise<Map<string, number>>
  coordinatorsForCareer(careerId: string): Promise<string[]>
  coordinatorsForCareers(careerIds: string[]): Promise<string[]>
  coordinatorsForProcess(processId: string): Promise<string[]>
  coordinatorsWithPendingWork(processId: string): Promise<string[]>
  teachersWithPendingWork(processId: string): Promise<string[]>
  teachersForProcess(processId: string): Promise<string[]>
  librarians(): Promise<string[]>
  administrators(): Promise<string[]>
}

export function recipientsOn(executor: Executor): Recipients {
  const coordinatorsForCareers = async (careerIds: string[]) =>
    careerIds.length === 0
      ? []
      : ids(
          executor
            .select({ id: asignacionesRol.usuarioId })
            .from(asignacionesRol)
            .where(
              and(
                eq(asignacionesRol.rol, "coordinador"),
                inArray(asignacionesRol.carreraId, careerIds),
                eq(asignacionesRol.asignacionRolActiva, true),
                activeUser(executor, asignacionesRol.usuarioId),
              ),
            ),
        )
  const withRole = (role: string) =>
    ids(
      executor
        .select({ id: asignacionesRol.usuarioId })
        .from(asignacionesRol)
        .where(and(eq(asignacionesRol.asignacionRolActiva, true), eq(asignacionesRol.rol, role), activeUser(executor, asignacionesRol.usuarioId))),
    )
  const convocationsOf = (processId: string) =>
    ids(
      executor
        .select({ id: convocatoriasCarreras.convocatoriaCarreraId })
        .from(convocatoriasCarreras)
        .where(and(eq(convocatoriasCarreras.convocatoriaUniversidadId, processId), processAlive(executor))),
    )
  const teacherSyllabusCounts = async (convocationIds: string[], exceptStates: string[] = []) => {
    const counts = new Map<string, number>()
    if (convocationIds.length === 0) return counts
    const rows = await executor
      .select({ userId: docentesVigentesSilabo.usuarioId, syllabusId: docentesVigentesSilabo.silaboId })
      .from(docentesVigentesSilabo)
      .where(
        and(
          activeUser(executor, docentesVigentesSilabo.usuarioId),
          exists(
            executor
              .select({ id: silabos.silaboId })
              .from(silabos)
              .where(
                and(
                  eq(silabos.silaboId, docentesVigentesSilabo.silaboId),
                  inArray(silabos.convocatoriaCarreraId, convocationIds),
                  exceptStates.length === 0 ? undefined : notInArray(silabos.estadoSilabo, exceptStates),
                  SYLLABUS_ALIVE,
                ),
              ),
          ),
        ),
      )
    const seen = new Set<string>()
    for (const row of rows) {
      const key = `${row.userId}|${row.syllabusId}`
      if (seen.has(key)) continue
      seen.add(key)
      counts.set(row.userId, (counts.get(row.userId) ?? 0) + 1)
    }
    return counts
  }
  return {
    teachersFor: (syllabusId) =>
      ids(
        executor
          .select({ id: docentesVigentesSilabo.usuarioId })
          .from(docentesVigentesSilabo)
          .where(and(eq(docentesVigentesSilabo.silaboId, syllabusId), activeUser(executor, docentesVigentesSilabo.usuarioId))),
      ),
    teacherSyllabusCounts,
    coordinatorsForCareer: (careerId) => coordinatorsForCareers([careerId]),
    coordinatorsForCareers,
    async coordinatorsForProcess(processId) {
      let careers = await ids(
        executor
          .select({ id: convocatoriasCarreras.carreraId })
          .from(convocatoriasCarreras)
          .where(and(eq(convocatoriasCarreras.convocatoriaUniversidadId, processId), processAlive(executor))),
      )
      if (careers.length === 0) careers = await ids(executor.select({ id: carreras.carreraId }).from(carreras).where(eq(carreras.carreraActiva, true)))
      return coordinatorsForCareers(careers)
    },
    async coordinatorsWithPendingWork(processId) {
      const careers = await ids(
        executor
          .select({ id: convocatoriasCarreras.carreraId })
          .from(convocatoriasCarreras)
          .where(
            and(
              eq(convocatoriasCarreras.convocatoriaUniversidadId, processId),
              processAlive(executor),
              exists(
                executor
                  .select({ id: silabos.silaboId })
                  .from(silabos)
                  .where(
                    and(eq(silabos.convocatoriaCarreraId, convocatoriasCarreras.convocatoriaCarreraId), notInArray(silabos.estadoSilabo, ["aprobado"]), SYLLABUS_ALIVE),
                  ),
              ),
            ),
          ),
      )
      return coordinatorsForCareers(careers)
    },
    async teachersWithPendingWork(processId) {
      return [...(await teacherSyllabusCounts(await convocationsOf(processId), ["aprobado"])).keys()]
    },
    async teachersForProcess(processId) {
      return [...(await teacherSyllabusCounts(await convocationsOf(processId))).keys()]
    },
    librarians: () => withRole("bibliotecario"),
    administrators: () => withRole("administrador"),
  }
}
