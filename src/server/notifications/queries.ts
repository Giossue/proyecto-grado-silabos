import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { frontendUrl } from "../mail/config"
import { queueMail } from "../mail/sendMailJob"
import { uuidList } from "../laravel/sql"
import { uuid7 } from "../laravel/uuid7"
import type { QueuedMail } from "../mail/mailables"
import type { AfterCommit } from "../queue/dispatch"
import { phpJsonDecode } from "../configuration/phpValues"
import { rowsOf, type Executor } from "../syllabus/teacherSyllabusQueries"
import { notificationEmailConfig } from "./config"
import type { NotificationScope, NotificationTx } from "./store"

const SYLLABUS_ALIVE = sql`exists (select 1 from convocatorias_carreras vivo where vivo.convocatoria_carrera_id = silabos.convocatoria_carrera_id
  and exists (select 1 from convocatorias_universidad vivo_proceso where vivo_proceso.convocatoria_universidad_id = vivo.convocatoria_universidad_id))`

async function firstValue(executor: Executor, query: SQL): Promise<string | null> {
  const [row] = await rowsOf<{ value: string | null }>(executor, query)
  return row?.value ?? null
}

async function processOfSyllabus(executor: Executor, syllabusId: string | null): Promise<string | null> {
  if (syllabusId === null) return null
  const convocationId = await firstValue(
    executor,
    sql`select silabos.convocatoria_carrera_id::text as value from silabos where silabos.silabo_id = ${syllabusId}::uuid and ${SYLLABUS_ALIVE} limit 1`,
  )
  return convocationId === null ? null : processOfConvocation(executor, convocationId)
}

function processOfConvocation(executor: Executor, convocationId: string): Promise<string | null> {
  return firstValue(
    executor,
    sql`select convocatoria.convocatoria_universidad_id::text as value from convocatorias_carreras convocatoria
      where convocatoria.convocatoria_carrera_id = ${convocationId}::uuid
        and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id) limit 1`,
  )
}

export function notificationTx(executor: Executor): NotificationTx {
  return {
    async recipients(ids) {
      const rows = await rowsOf<{ id: string; name: string; email: string; verified: boolean; preferences: string | null }>(
        executor,
        sql`select usuario_id::text as id, nombre_usuario as name, correo_electronico as email, correo_verificado_en is not null as verified,
            preferencias_correo_usuario::text as preferences
          from usuarios where usuario_id in (${uuidList(ids)}) and usuario_activo = true`,
      )
      return rows.map((row) => ({ ...row, preferences: phpJsonDecode(row.preferences) }))
    },
    async periodOf(resourceType, resourceId) {
      let processId: string | null = null
      if (resourceType === "proceso_silabos") processId = resourceId
      else if (resourceType === "convocatoria") processId = await processOfConvocation(executor, resourceId)
      else if (resourceType === "silabo") processId = await processOfSyllabus(executor, resourceId)
      else if (resourceType === "artefacto_exportacion") {
        const syllabusId = await firstValue(
          executor,
          sql`select revision.silabo_id::text as value from exportaciones_silabo exportacion
            inner join revisiones_silabo revision on revision.revision_silabo_id = exportacion.revision_silabo_id
            where exportacion.exportacion_silabo_id = ${resourceId}::uuid limit 1`,
        )
        processId = await processOfSyllabus(executor, syllabusId)
      }
      if (processId === null) return null
      return firstValue(
        executor,
        sql`select periodo_academico_id::text as value from convocatorias_universidad where convocatoria_universidad_id = ${processId}::uuid limit 1`,
      )
    },
    async create(row) {
      const inserted = await rowsOf<{ id: string }>(
        executor,
        sql`insert into notificaciones (notificacion_id, usuario_id, clave_unica, tipo_notificacion, titulo_notificacion, mensaje_notificacion,
            tipo_recurso, recurso_id, periodo_academico_id, notificado_en)
          values (${uuid7()}::uuid, ${row.userId}::uuid, ${row.key}, ${row.type}, ${row.title}, ${row.message}, ${row.resourceType},
            ${row.resourceId}::uuid, ${row.periodId}::uuid, to_timestamp(${row.notifiedAt}))
          on conflict (usuario_id, clave_unica) do nothing returning notificacion_id::text as id`,
      )
      return inserted.length > 0
    },
    subjectOf(syllabusId) {
      return firstValue(
        executor,
        sql`select asignatura.nombre_asignatura as value from silabos
          inner join paralelos paralelo on paralelo.paralelo_id = silabos.paralelo_id
          inner join asignaturas asignatura on asignatura.asignatura_id = paralelo.asignatura_id
          where silabos.silabo_id = ${syllabusId}::uuid limit 1`,
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

async function ids(executor: Executor, query: SQL): Promise<string[]> {
  return unique((await rowsOf<{ id: string | null }>(executor, query)).map((row) => row.id).filter((id): id is string => typeof id === "string"))
}

const ACTIVE_USER = sql`exists (select 1 from usuarios usuario where usuario.usuario_id = asignaciones_rol.usuario_id and usuario.usuario_activo = true)`

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
          executor,
          sql`select asignaciones_rol.usuario_id::text as id from asignaciones_rol where asignaciones_rol.rol = 'coordinador'
            and asignaciones_rol.carrera_id in (${uuidList(careerIds)}) and asignaciones_rol.asignacion_rol_activa = true and ${ACTIVE_USER}`,
        )
  const withRole = (role: string) =>
    ids(
      executor,
      sql`select asignaciones_rol.usuario_id::text as id from asignaciones_rol where asignaciones_rol.asignacion_rol_activa = true
        and asignaciones_rol.rol = ${role} and ${ACTIVE_USER}`,
    )
  const convocationsOf = (processId: string) =>
    ids(
      executor,
      sql`select convocatoria_carrera_id::text as id from convocatorias_carreras where convocatoria_universidad_id = ${processId}::uuid
        and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id)`,
    )
  const teacherSyllabusCounts = async (convocationIds: string[], exceptStates: string[] = []) => {
    const counts = new Map<string, number>()
    if (convocationIds.length === 0) return counts
    const rows = await rowsOf<{ user_id: string; syllabus_id: string }>(
      executor,
      sql`select docentes.usuario_id::text as user_id, docentes.silabo_id::text as syllabus_id from docentes_vigentes_silabo docentes
        where exists (select 1 from usuarios usuario where usuario.usuario_id = docentes.usuario_id and usuario.usuario_activo = true)
          and exists (select 1 from silabos where silabos.silabo_id = docentes.silabo_id and silabos.convocatoria_carrera_id in (${uuidList(convocationIds)})
            ${exceptStates.length === 0 ? sql`` : sql`and silabos.estado_silabo not in (${sql.join(exceptStates.map((state) => sql`${state}`), sql`, `)})`}
            and ${SYLLABUS_ALIVE})`,
    )
    const seen = new Set<string>()
    for (const row of rows) {
      const key = `${row.user_id}|${row.syllabus_id}`
      if (seen.has(key)) continue
      seen.add(key)
      counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1)
    }
    return counts
  }
  return {
    teachersFor: (syllabusId) =>
      ids(
        executor,
        sql`select docentes.usuario_id::text as id from docentes_vigentes_silabo docentes where docentes.silabo_id = ${syllabusId}::uuid
          and exists (select 1 from usuarios usuario where usuario.usuario_id = docentes.usuario_id and usuario.usuario_activo = true)`,
      ),
    teacherSyllabusCounts,
    coordinatorsForCareer: (careerId) => coordinatorsForCareers([careerId]),
    coordinatorsForCareers,
    async coordinatorsForProcess(processId) {
      let careers = await ids(
        executor,
        sql`select carrera_id::text as id from convocatorias_carreras where convocatoria_universidad_id = ${processId}::uuid
          and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id)`,
      )
      if (careers.length === 0) careers = await ids(executor, sql`select carrera_id::text as id from carreras where carrera_activa = true`)
      return coordinatorsForCareers(careers)
    },
    async coordinatorsWithPendingWork(processId) {
      const careers = await ids(
        executor,
        sql`select carrera_id::text as id from convocatorias_carreras where convocatoria_universidad_id = ${processId}::uuid
          and exists (select 1 from convocatorias_universidad proceso where proceso.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id)
          and exists (select 1 from silabos where silabos.convocatoria_carrera_id = convocatorias_carreras.convocatoria_carrera_id
            and silabos.estado_silabo not in ('aprobado') and ${SYLLABUS_ALIVE})`,
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
