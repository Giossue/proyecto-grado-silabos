import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import type { AuditEventRow, AuditFilters, AuditRepository, Option } from "./auditEvents"
import { ROLE_LABELS } from "./auditEvents"
import { careerLabelSql } from "../academic/careerLabel"

const TECHNICAL_ACTIONS = [
  "sesion.iniciada", "sesion.cerrada", "sesiones.remotas_cerradas", "rol_activo.seleccionado",
  "silabo.campo_guardado", "silabo.validado", "silabo.borrador_iniciado",
  "documento.descargado", "documento.exportacion_solicitada", "documento.exportacion_completada", "documento.exportacion_fallida",
  "trabajo.reintento_solicitado", "ia.plantilla_solicitada", "ia.analisis_solicitado", "ia.analisis_completado", "ia.analisis_fallido",
  "plantilla.propuesta_ia_descartada", "ayuda.guardada", "ayuda.eliminada", "ia.chat_solicitado",
]
const REVISION_BACKED: Record<string, [table: string, key: string] | null> = {
  revision_silabo: null,
  aprobacion: ["aprobaciones", "aprobacion_id"],
  revision_coordinacion: ["revisiones_coordinacion", "revision_coordinacion_id"],
  envio_biblioteca: ["envios_biblioteca", "envio_biblioteca_id"],
  firma_silabo: ["firmas_silabo", "firma_silabo_id"],
}

const institutionTimezone = () => process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil"
const iso8601 = (column: SQL) => sql`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"')`
const uuids = (ids: string[]) => sql`array[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::uuid[]`

async function rows<T>(query: SQL): Promise<T[]> {
  return (await db.execute(query)).rows as T[]
}

function startOfDay(date: SQL): SQL {
  return sql`((${date})::date::timestamp at time zone ${institutionTimezone()})`
}

function endOfDay(date: SQL): SQL {
  return sql`(((${date})::date + 1)::timestamp - interval '1 microsecond') at time zone ${institutionTimezone()}`
}

type Resolved = {
  period: { start: string; end: string } | null | undefined
  career: { id: string; label: string } | null | undefined
}

async function resolveFilters(filters: AuditFilters): Promise<Resolved> {
  const [period] =
    filters.period === ""
      ? [undefined]
      : await rows<{ start: string; end: string }>(sql`select ${startOfDay(sql`fecha_inicio_periodo`)}::text as start, ${endOfDay(sql`fecha_fin_periodo`)}::text as end
          from periodos_academicos where periodo_academico_id = ${filters.period}::uuid`)
  const [career] =
    filters.career === ""
      ? [undefined]
      : await rows<{ id: string; label: string }>(sql`select carrera.carrera_id::text as id, ${careerLabelSql("carrera")} as label
          from carreras carrera where carrera.carrera_id = ${filters.career}::uuid`)
  return {
    period: filters.period === "" ? undefined : (period ?? null),
    career: filters.career === "" ? undefined : (career ?? null),
  }
}

function conditions(filters: AuditFilters, resolved: Resolved): SQL {
  const where: SQL[] = [sql`true`]
  if (filters.action !== "") where.push(sql`eventos_auditoria.accion = ${filters.action}`)
  else if (!filters.technical) where.push(sql`eventos_auditoria.accion not in (${sql.join(TECHNICAL_ACTIONS.map((action) => sql`${action}`), sql`, `)})`)
  if (filters.result !== "") where.push(sql`eventos_auditoria.resultado = ${filters.result}`)
  if (resolved.period === null) where.push(sql`1 = 0`)
  else if (resolved.period !== undefined) where.push(sql`eventos_auditoria.ocurrido_en between ${resolved.period.start}::timestamptz and ${resolved.period.end}::timestamptz`)
  const roleLabel = Object.prototype.hasOwnProperty.call(ROLE_LABELS, filters.role) ? ROLE_LABELS[filters.role] : null
  if (roleLabel !== null) {
    where.push(sql`(eventos_auditoria.actor_rol = ${roleLabel} or exists (select 1 from asignaciones_rol asignacion
      where asignacion.asignacion_rol_id = eventos_auditoria.asignacion_rol_id and asignacion.rol = ${filters.role}))`)
  }
  if (resolved.career === null) where.push(sql`1 = 0`)
  else if (resolved.career !== undefined) {
    where.push(sql`(eventos_auditoria.actor_carrera = ${resolved.career.label} or exists (select 1 from asignaciones_rol asignacion
      where asignacion.asignacion_rol_id = eventos_auditoria.asignacion_rol_id and asignacion.carrera_id = ${resolved.career.id}::uuid))`)
  }
  if (filters.from !== "") where.push(sql`eventos_auditoria.ocurrido_en >= ${startOfDay(sql`${filters.from}`)}`)
  if (filters.to !== "") where.push(sql`eventos_auditoria.ocurrido_en <= ${endOfDay(sql`${filters.to}`)}`)
  return sql.join(where, sql` and `)
}

type EventRecord = {
  id: string
  accion: string
  tipo_recurso: string
  recurso_id: string | null
  resultado: string
  usuario_id: string | null
  asignacion_rol_id: string | null
  actor_nombre: string | null
  actor_rol: string | null
  actor_carrera: string | null
  detalles: unknown
  occurred_at: string
  occurred_local: string
}

async function page(filters: AuditFilters, currentPage: number, perPage: number): Promise<{ total: number; items: AuditEventRow[] }> {
  const where = conditions(filters, await resolveFilters(filters))
  const [{ total }] = await rows<{ total: string }>(sql`select count(*) as total from eventos_auditoria where ${where}`)
  if (Number(total) === 0) return { total: 0, items: [] }
  return { total: Number(total), items: await loadEvents(where, sql`order by ocurrido_en desc limit ${perPage} offset ${(currentPage - 1) * perPage}`) }
}

async function all(filters: AuditFilters): Promise<AuditEventRow[]> {
  return loadEvents(conditions(filters, await resolveFilters(filters)), sql`order by ocurrido_en asc`)
}

async function loadEvents(where: SQL, tail: SQL): Promise<AuditEventRow[]> {
  const events = await rows<EventRecord>(sql`select evento_auditoria_id::text as id, accion, tipo_recurso, recurso_id::text as recurso_id, resultado,
      usuario_id::text as usuario_id, asignacion_rol_id::text as asignacion_rol_id, actor_nombre, actor_rol, actor_carrera, detalles,
      ${iso8601(sql`ocurrido_en`)} as occurred_at,
      to_char(ocurrido_en at time zone ${institutionTimezone()}, 'YYYY-MM-DD HH24:MI:SS') as occurred_local
    from eventos_auditoria where ${where} ${tail}`)
  const userIds = [...new Set(events.flatMap((event) => (event.usuario_id === null ? [] : [event.usuario_id])))]
  const assignmentIds = [...new Set(events.flatMap((event) => (event.asignacion_rol_id === null ? [] : [event.asignacion_rol_id])))]
  const users = new Map(
    userIds.length === 0
      ? []
      : (await rows<{ id: string; name: string }>(sql`select usuario_id::text as id, nombre_usuario as name from usuarios where usuario_id = any(${uuids(userIds)})`)).map(
          (user) => [user.id, user.name] as const,
        ),
  )
  const assignments = new Map(
    assignmentIds.length === 0
      ? []
      : (
          await rows<{ id: string; rol: string; career: string | null }>(sql`select asignacion.asignacion_rol_id::text as id, asignacion.rol,
              case when carrera.carrera_id is null then null else ${careerLabelSql("carrera")} end as career
            from asignaciones_rol asignacion left join carreras carrera on carrera.carrera_id = asignacion.carrera_id
            where asignacion.asignacion_rol_id = any(${uuids(assignmentIds)})`)
        ).map((assignment) => [assignment.id, assignment] as const),
  )
  return events.map((event) => {
      const assignment = event.asignacion_rol_id === null ? undefined : assignments.get(event.asignacion_rol_id)
      return {
        id: event.id,
        action: event.accion,
        resourceType: event.tipo_recurso,
        resourceId: event.recurso_id,
        result: event.resultado,
        actorUserId: event.usuario_id,
        actorName: event.actor_nombre,
        actorUserName: event.usuario_id === null ? null : (users.get(event.usuario_id) ?? null),
        actorRole: event.actor_rol,
        assignmentRole: assignment?.rol ?? null,
        actorCareer: event.actor_carrera,
        assignmentCareer: assignment?.career ?? null,
        metadata: event.detalles,
        occurredAt: event.occurred_at,
        occurredLocal: event.occurred_local,
      }
    })
}

async function pairs(query: SQL): Promise<Map<string, string>> {
  return new Map((await rows<{ id: string; name: string | null }>(query)).flatMap((row) => (row.name === null ? [] : [[row.id, row.name] as const])))
}

const LIVE_SYLLABUS = sql`exists (select 1 from convocatorias_carreras convocatoria
  inner join convocatorias_universidad proceso on proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id
  where convocatoria.convocatoria_carrera_id = silabo.convocatoria_carrera_id)`

async function syllabusNames(syllabusByResource: Map<string, string>): Promise<Map<string, string>> {
  const ids = [...new Set(syllabusByResource.values())]
  if (ids.length === 0) return new Map()
  const syllabi = await rows<{ id: string; subject: string; parallel: string }>(sql`select silabo.silabo_id::text as id,
      case when jsonb_typeof(silabo.datos_academicos_silabo #> '{subject,name}') = 'string'
        then silabo.datos_academicos_silabo #>> '{subject,name}' else asignatura.nombre_asignatura end as subject,
      case when jsonb_typeof(silabo.datos_academicos_silabo #> '{parallel,code}') = 'string'
        then silabo.datos_academicos_silabo #>> '{parallel,code}' else paralelo.codigo_paralelo end as parallel
    from silabos silabo
    left join paralelos paralelo on paralelo.paralelo_id = silabo.paralelo_id
    left join asignaturas asignatura on asignatura.asignatura_id = paralelo.asignatura_id
    where silabo.silabo_id = any(${uuids(ids)}) and ${LIVE_SYLLABUS}`)
  const teachers = await rows<{ syllabus: string; name: string }>(sql`select docente.silabo_id::text as syllabus, usuario.nombre_usuario as name
    from usuarios usuario inner join docentes_vigentes_silabo docente on docente.usuario_id = usuario.usuario_id
    where docente.silabo_id = any(${uuids(ids)})`)
  const found = new Map(syllabi.map((syllabus) => [syllabus.id, syllabus]))
  const names = new Map<string, string>()
  for (const [resourceId, syllabusId] of syllabusByResource) {
    const syllabus = found.get(syllabusId)
    if (!syllabus) continue
    const list = [...new Set(teachers.filter((teacher) => teacher.syllabus === syllabusId).map((teacher) => teacher.name))].join(", ")
    names.set(resourceId, `${syllabus.subject} · Paralelo ${syllabus.parallel}${list !== "" ? ` · ${list}` : ""}`)
  }
  return names
}

async function revisionSyllabi(type: string, ids: string[]): Promise<Map<string, string>> {
  const source = REVISION_BACKED[type]
  const revisionByResource = source
    ? await pairs(sql`select ${sql.raw(source[1])}::text as id, revision_silabo_id::text as name from ${sql.raw(source[0])}
        where ${sql.raw(source[1])} = any(${uuids(ids)})`)
    : new Map(ids.map((id) => [id, id]))
  const revisions = [...new Set(revisionByResource.values())]
  if (revisions.length === 0) return new Map()
  const syllabusByRevision = await pairs(sql`select revision.revision_silabo_id::text as id, revision.silabo_id::text as name
    from revisiones_silabo revision inner join silabos silabo on silabo.silabo_id = revision.silabo_id
    where revision.revision_silabo_id = any(${uuids(revisions)}) and ${LIVE_SYLLABUS}`)
  const map = new Map<string, string>()
  for (const [resourceId, revisionId] of revisionByResource) {
    const syllabusId = syllabusByRevision.get(revisionId)
    if (syllabusId !== undefined) map.set(resourceId, syllabusId)
  }
  return map
}

async function targetNames(type: string, ids: string[]): Promise<Map<string, string>> {
  if (Object.prototype.hasOwnProperty.call(REVISION_BACKED, type)) return syllabusNames(await revisionSyllabi(type, ids))
  const list = uuids(ids)
  switch (type) {
    case "silabo":
      return syllabusNames(new Map(ids.map((id) => [id, id])))
    case "paralelo":
      return pairs(sql`select paralelo.paralelo_id::text as id,
          coalesce(asignatura.codigo_asignatura, '') || ' ' || coalesce(asignatura.nombre_asignatura, '') || ' · Paralelo ' || coalesce(paralelo.codigo_paralelo, '') as name
        from paralelos paralelo left join asignaturas asignatura on asignatura.asignatura_id = paralelo.asignatura_id
        where paralelo.paralelo_id = any(${list})`)
    case "asignatura":
      return pairs(sql`select asignatura_id::text as id, coalesce(codigo_asignatura, '') || ' ' || coalesce(nombre_asignatura, '') as name
        from asignaturas where asignatura_id = any(${list})`)
    case "usuario":
      return pairs(sql`select usuario_id::text as id, coalesce(nombre_usuario, '') || ' (' || coalesce(correo_electronico, '') || ')' as name
        from usuarios where usuario_id = any(${list})`)
    case "asignacion_rol":
      return roleAssignmentNames(list)
    case "asignacion_docente":
      return pairs(sql`select asignacion.asignacion_paralelo_id::text as id,
          coalesce(asignatura.nombre_asignatura, '') || ' · Paralelo ' || coalesce(paralelo.codigo_paralelo, '') || ' · ' || coalesce(usuario.nombre_usuario, '') as name
        from asignaciones_paralelo asignacion
        inner join paralelos paralelo on paralelo.paralelo_id = asignacion.paralelo_id
        inner join asignaturas asignatura on asignatura.asignatura_id = paralelo.asignatura_id
        inner join asignaciones_rol rol on rol.asignacion_rol_id = asignacion.asignacion_rol_id
        left join usuarios usuario on usuario.usuario_id = rol.usuario_id
        where asignacion.asignacion_paralelo_id = any(${list})`)
    case "facultad":
      return pairs(sql`select facultad_id::text as id, nombre_facultad as name from facultades where facultad_id = any(${list})`)
    case "carrera":
      return pairs(sql`select carrera.carrera_id::text as id, ${careerLabelSql("carrera")} as name from carreras carrera where carrera.carrera_id = any(${list})`)
    case "periodo":
      return pairs(sql`select periodo_academico_id::text as id, codigo_periodo_academico as name from periodos_academicos where periodo_academico_id = any(${list})`)
    case "convocatoria":
      return pairs(sql`select convocatoria.convocatoria_carrera_id::text as id,
          ${careerLabelSql("carrera")} || ' · ' || coalesce(periodo.codigo_periodo_academico, '') as name
        from convocatorias_carreras convocatoria
        inner join convocatorias_universidad proceso on proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id
        inner join carreras carrera on carrera.carrera_id = convocatoria.carrera_id
        left join periodos_academicos periodo on periodo.periodo_academico_id = proceso.periodo_academico_id
        where convocatoria.convocatoria_carrera_id = any(${list})`)
    case "proceso_silabos":
      return pairs(sql`select proceso.convocatoria_universidad_id::text as id, 'Convocatoria institucional ' || coalesce(periodo.codigo_periodo_academico, '') as name
        from convocatorias_universidad proceso left join periodos_academicos periodo on periodo.periodo_academico_id = proceso.periodo_academico_id
        where proceso.convocatoria_universidad_id = any(${list})`)
    case "documento_apoyo":
      return pairs(sql`select documento_apoyo_id::text as id, titulo_documento as name from documentos_apoyo where documento_apoyo_id = any(${list})`)
    case "requisito_asignatura":
      return pairs(sql`select requisito.requisito_asignatura_id::text as id,
          coalesce(materia.codigo_asignatura, '') || ' requiere ' || coalesce(previa.codigo_asignatura, '') as name
        from requisitos_asignatura requisito
        left join asignaturas materia on materia.asignatura_id = requisito.asignatura_id
        left join asignaturas previa on previa.asignatura_id = requisito.requisito_id
        where requisito.requisito_asignatura_id = any(${list})`)
    case "plantilla_silabo":
      return new Map(ids.map((id) => [id, "Plantilla del sílabo"]))
    default:
      return new Map()
  }
}

async function roleAssignmentNames(list: SQL): Promise<Map<string, string>> {
  const found = await rows<{ id: string; user_name: string | null; rol: string; career: string | null }>(sql`select asignacion.asignacion_rol_id::text as id,
      usuario.nombre_usuario as user_name, asignacion.rol,
      case when carrera.carrera_id is null then null else ${careerLabelSql("carrera")} end as career
    from asignaciones_rol asignacion
    left join usuarios usuario on usuario.usuario_id = asignacion.usuario_id
    left join carreras carrera on carrera.carrera_id = asignacion.carrera_id
    where asignacion.asignacion_rol_id = any(${list})`)
  return new Map(
    found.map((assignment) => [
      assignment.id,
      `${assignment.user_name ?? ""} · ${ROLE_LABELS[assignment.rol] ?? ""}${assignment.career !== null ? ` de ${assignment.career}` : ""}`.trim(),
    ]),
  )
}

export function createAuditRepository(): AuditRepository {
  return {
    page,
    all,
    async periodCode(id) {
      const [row] = await rows<{ code: string }>(sql`select codigo_periodo_academico as code from periodos_academicos where periodo_academico_id = ${id}::uuid limit 1`)
      return row?.code ?? null
    },
    async actionOptions() {
      return (await rows<{ accion: string }>(sql`select distinct accion from eventos_auditoria order by accion asc`)).map((row) => row.accion)
    },
    async periodOptions(): Promise<Option[]> {
      return rows<Option>(sql`select periodo_academico_id::text as value, codigo_periodo_academico as label
        from periodos_academicos order by fecha_inicio_periodo desc`)
    },
    async careerOptions(): Promise<Option[]> {
      return rows<Option>(sql`select carrera.carrera_id::text as value, ${careerLabelSql("carrera")} as label
        from carreras carrera order by carrera.nombre_carrera asc, carrera.codigo_carrera asc`)
    },
    targetNames,
  }
}
