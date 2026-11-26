import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import { fromEpoch, jsonText } from "../../prisma/sql"
import { frontendUrl } from "../mail/config"
import { queueMail } from "../mail/sendMailJob"
import { uuid7 } from "../http/uuid7"
import type { QueuedMail } from "../mail/mailables"
import type { AfterCommit } from "../queue/dispatch"
import { phpJsonDecode } from "../configuration/phpValues"
import { notificationEmailConfig } from "./config"
import type { NotificationScope, NotificationTx } from "./store"

const SYLLABUS_ALIVE = Prisma.sql`exists (select 1 from convocatorias_carreras vivo where vivo.convocatoria_carrera_id = silabos.convocatoria_carrera_id
  and exists (select 1 from convocatorias_universidad vivo_proceso where vivo_proceso.convocatoria_universidad_id = vivo.convocatoria_universidad_id))`

const PROCESS_ALIVE = Prisma.sql`exists (select convocatorias_universidad.convocatoria_universidad_id from convocatorias_universidad
  where convocatorias_universidad.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id)`

async function firstValue(query: PromiseLike<{ value: string | null }[]>): Promise<string | null> {
  const [row] = await query
  return row?.value ?? null
}

async function processOfSyllabus(db: Db, syllabusId: string | null): Promise<string | null> {
  if (syllabusId === null) return null
  const convocationId = await firstValue(
    db.$queryRaw<{ value: string }[]>`select silabos.convocatoria_carrera_id::text as value from silabos
      where silabos.silabo_id = ${syllabusId}::uuid and ${SYLLABUS_ALIVE} limit 1`,
  )
  return convocationId === null ? null : processOfConvocation(db, convocationId)
}

function processOfConvocation(db: Db, convocationId: string): Promise<string | null> {
  return firstValue(
    db.$queryRaw<{ value: string }[]>`select convocatorias_carreras.convocatoria_universidad_id::text as value from convocatorias_carreras
      where convocatorias_carreras.convocatoria_carrera_id = ${convocationId}::uuid and ${PROCESS_ALIVE} limit 1`,
  )
}

type RecipientRow = { id: string; name: string; email: string; verified: boolean; preferences: string | null }

export function notificationTx(db: Db): NotificationTx {
  return {
    async recipients(ids) {
      const rows = await db.$queryRaw<RecipientRow[]>`select usuarios.usuario_id::text as id, usuarios.nombre_usuario as name, usuarios.correo_electronico as email,
          usuarios.correo_verificado_en is not null as verified, ${jsonText(Prisma.raw("usuarios.preferencias_correo_usuario"))} as preferences
        from usuarios
        where usuarios.usuario_id = any(${ids}::uuid[]) and usuarios.usuario_activo = true`
      return rows.map((row) => ({ ...row, verified: Boolean(row.verified), preferences: phpJsonDecode(row.preferences) }))
    },
    async periodOf(resourceType, resourceId) {
      let processId: string | null = null
      if (resourceType === "proceso_silabos") processId = resourceId
      else if (resourceType === "convocatoria") processId = await processOfConvocation(db, resourceId)
      else if (resourceType === "silabo") processId = await processOfSyllabus(db, resourceId)
      else if (resourceType === "artefacto_exportacion") {
        const syllabusId = await firstValue(
          db.$queryRaw<{ value: string }[]>`select revisiones_silabo.silabo_id::text as value from exportaciones_silabo
            inner join revisiones_silabo on revisiones_silabo.revision_silabo_id = exportaciones_silabo.revision_silabo_id
            where exportaciones_silabo.exportacion_silabo_id = ${resourceId}::uuid limit 1`,
        )
        processId = await processOfSyllabus(db, syllabusId)
      }
      if (processId === null) return null
      return firstValue(
        db.$queryRaw<{ value: string | null }[]>`select convocatorias_universidad.periodo_academico_id::text as value from convocatorias_universidad
          where convocatorias_universidad.convocatoria_universidad_id = ${processId}::uuid limit 1`,
      )
    },
    async create(row) {
      const inserted = await db.$queryRaw<{ id: string }[]>`insert into notificaciones (notificacion_id, usuario_id, clave_unica, tipo_notificacion, titulo_notificacion,
          mensaje_notificacion, tipo_recurso, recurso_id, periodo_academico_id, notificado_en)
        values (${uuid7()}::uuid, ${row.userId}::uuid, ${row.key}, ${row.type}, ${row.title}, ${row.message}, ${row.resourceType}, ${row.resourceId}::uuid,
          ${row.periodId}::uuid, ${fromEpoch(row.notifiedAt)})
        on conflict (usuario_id, clave_unica) do nothing
        returning notificacion_id::text as id`
      return inserted.length > 0
    },
    subjectOf(syllabusId) {
      return firstValue(
        db.$queryRaw<{ value: string }[]>`select asignaturas.nombre_asignatura as value from silabos
          inner join paralelos on paralelos.paralelo_id = silabos.paralelo_id
          inner join asignaturas on asignaturas.asignatura_id = paralelos.asignatura_id
          where silabos.silabo_id = ${syllabusId}::uuid limit 1`,
      )
    },
  }
}

export type Mail = (mail: QueuedMail) => Promise<unknown>

export type WriteOptions = { now?: () => number; mail?: Mail }

export function notificationScope(db: Db, afterCommit: AfterCommit, now: number, mail: Mail = queueMail): NotificationScope {
  return { tx: notificationTx(db), afterCommit, mail, now, email: notificationEmailConfig(), frontendUrl: frontendUrl() }
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

async function ids(query: PromiseLike<{ id: string | null }[]>): Promise<string[]> {
  return unique((await query).map((row) => row.id).filter((id): id is string => typeof id === "string"))
}

function activeUser(user: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`exists (select usuarios.usuario_id from usuarios where usuarios.usuario_id = ${user} and usuarios.usuario_activo = true)`
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

const ROLE_USER = Prisma.raw("asignaciones_rol.usuario_id")
const TEACHER_USER = Prisma.raw("docentes_vigentes_silabo.usuario_id")

export function recipientsOn(db: Db): Recipients {
  const coordinatorsForCareers = async (careerIds: string[]) =>
    careerIds.length === 0
      ? []
      : ids(
          db.$queryRaw<{ id: string }[]>`select asignaciones_rol.usuario_id::text as id from asignaciones_rol
            where asignaciones_rol.rol = 'coordinador' and asignaciones_rol.carrera_id = any(${careerIds}::uuid[])
              and asignaciones_rol.asignacion_rol_activa = true and ${activeUser(ROLE_USER)}`,
        )
  const withRole = (role: string) =>
    ids(
      db.$queryRaw<{ id: string }[]>`select asignaciones_rol.usuario_id::text as id from asignaciones_rol
        where asignaciones_rol.asignacion_rol_activa = true and asignaciones_rol.rol = ${role} and ${activeUser(ROLE_USER)}`,
    )
  const convocationsOf = (processId: string) =>
    ids(
      db.$queryRaw<{ id: string }[]>`select convocatorias_carreras.convocatoria_carrera_id::text as id from convocatorias_carreras
        where convocatorias_carreras.convocatoria_universidad_id = ${processId}::uuid and ${PROCESS_ALIVE}`,
    )
  const teacherSyllabusCounts = async (convocationIds: string[], exceptStates: string[] = []) => {
    const counts = new Map<string, number>()
    if (convocationIds.length === 0) return counts
    const except = exceptStates.length === 0 ? Prisma.empty : Prisma.sql`and silabos.estado_silabo <> all(${exceptStates}::text[])`
    const rows = await db.$queryRaw<{ userId: string; syllabusId: string }[]>`select docentes_vigentes_silabo.usuario_id::text as "userId",
        docentes_vigentes_silabo.silabo_id::text as "syllabusId"
      from docentes_vigentes_silabo
      where ${activeUser(TEACHER_USER)}
        and exists (select silabos.silabo_id from silabos
          where silabos.silabo_id = docentes_vigentes_silabo.silabo_id and silabos.convocatoria_carrera_id = any(${convocationIds}::uuid[])
            ${except} and ${SYLLABUS_ALIVE})`
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
        db.$queryRaw<{ id: string }[]>`select docentes_vigentes_silabo.usuario_id::text as id from docentes_vigentes_silabo
          where docentes_vigentes_silabo.silabo_id = ${syllabusId}::uuid and ${activeUser(TEACHER_USER)}`,
      ),
    teacherSyllabusCounts,
    coordinatorsForCareer: (careerId) => coordinatorsForCareers([careerId]),
    coordinatorsForCareers,
    async coordinatorsForProcess(processId) {
      let careers = await ids(
        db.$queryRaw<{ id: string }[]>`select convocatorias_carreras.carrera_id::text as id from convocatorias_carreras
          where convocatorias_carreras.convocatoria_universidad_id = ${processId}::uuid and ${PROCESS_ALIVE}`,
      )
      if (careers.length === 0) careers = await ids(db.$queryRaw<{ id: string }[]>`select carreras.carrera_id::text as id from carreras where carreras.carrera_activa = true`)
      return coordinatorsForCareers(careers)
    },
    async coordinatorsWithPendingWork(processId) {
      const careers = await ids(
        db.$queryRaw<{ id: string }[]>`select convocatorias_carreras.carrera_id::text as id from convocatorias_carreras
          where convocatorias_carreras.convocatoria_universidad_id = ${processId}::uuid and ${PROCESS_ALIVE}
            and exists (select silabos.silabo_id from silabos
              where silabos.convocatoria_carrera_id = convocatorias_carreras.convocatoria_carrera_id and silabos.estado_silabo not in ('aprobado') and ${SYLLABUS_ALIVE})`,
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
