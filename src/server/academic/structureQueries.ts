import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import type {
  AcademicStructureRepository,
  CareerLock,
  CareerRecord,
  CareerTeacherRecord,
  PersonRecord,
  RequirementRecord,
  SubjectRecord,
  TeacherAssignmentRecord,
} from "./structure"

const institutionTimezone = () => process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil"

async function rows<T>(query: SQL): Promise<T[]> {
  return (await db.execute(query)).rows as T[]
}

function uuidList(ids: string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
}

type UserRow = { usuario_id: string; nombre_usuario: string; correo_electronico: string; verified: boolean; invited: boolean }

async function usersById(ids: string[]): Promise<Map<string, UserRow>> {
  if (ids.length === 0) return new Map()
  const found = await rows<UserRow>(sql`select usuario.usuario_id::text as usuario_id, usuario.nombre_usuario, usuario.correo_electronico,
      usuario.correo_verificado_en is not null as verified,
      exists (select 1 from invitaciones_activacion invitacion where invitacion.usuario_id = usuario.usuario_id
        and invitacion.usada_en is null and invitacion.invalidada_en is null and invitacion.expira_en > now()) as invited
    from usuarios usuario where usuario.usuario_id in (${uuidList([...new Set(ids)])})`)
  return new Map(found.map((row) => [row.usuario_id, row]))
}

type SubjectRow = {
  asignatura_id: string
  codigo_asignatura: string
  nombre_asignatura: string
  ciclo_asignatura: number | null
  orden_asignatura_en_ciclo: number
  unidad_curricular_asignatura: string | null
  modalidad_asignatura: string | null
  creditos_asignatura: string | null
  total_horas_asignatura: number | null
  horas_docencia: string | null
  horas_practicas: string | null
  horas_autonomas: string | null
  asignatura_activa: boolean
  genera_silabo_asignatura: boolean
}

function toSubject(row: SubjectRow): SubjectRecord {
  return {
    id: row.asignatura_id,
    code: row.codigo_asignatura,
    name: row.nombre_asignatura,
    cycle: row.ciclo_asignatura === null ? null : Number(row.ciclo_asignatura),
    position: Number(row.orden_asignatura_en_ciclo),
    organizationUnit: row.unidad_curricular_asignatura,
    modality: row.modalidad_asignatura,
    credits: row.creditos_asignatura,
    totalHours: row.total_horas_asignatura === null ? null : Number(row.total_horas_asignatura),
    hoursAc: row.horas_docencia,
    hoursPae: row.horas_practicas,
    hoursAa: row.horas_autonomas,
    active: row.asignatura_activa,
    generatesSyllabus: row.genera_silabo_asignatura,
  }
}

const ROLE_SCOPE = (careerId: string, roles: SQL) => sql`asignaciones_rol.asignacion_rol_activa = true
  and asignaciones_rol.carrera_id = ${careerId}::uuid and asignaciones_rol.rol in (${roles})`

export async function findActiveCareer(careerId: string): Promise<CareerRecord | null> {
  const [row] = await rows<{ carrera_id: string; nombre_carrera: string; modalidad_carrera: string | null; numero_ciclos: number }>(
    sql`select carrera_id::text as carrera_id, nombre_carrera, modalidad_carrera::text as modalidad_carrera, numero_ciclos
      from carreras where carrera_activa = true and carrera_id = ${careerId}::uuid limit 1`,
  )
  return row ? { id: row.carrera_id, name: row.nombre_carrera, modality: row.modalidad_carrera, cycleCount: Number(row.numero_ciclos) } : null
}

export async function findCareerLock(careerId: string): Promise<CareerLock | null> {
  const [row] = await rows<{ period: string | null; state: string; delivery_on: string }>(sql`select
      (select periodo.codigo_periodo_academico from periodos_academicos periodo where periodo.periodo_academico_id = proceso.periodo_academico_id) as period,
      proceso.estado_convocatoria_universidad as state,
      to_char(proceso.fecha_entrega at time zone ${institutionTimezone()}, 'YYYY-MM-DD') as delivery_on
    from (select * from convocatorias_carreras
      where carrera_id = ${careerId}::uuid and estado_convocatoria_carrera = 'abierta'
        and exists (select * from convocatorias_universidad where convocatorias_carreras.convocatoria_universidad_id = convocatorias_universidad.convocatoria_universidad_id
          and estado_convocatoria_universidad in ('abierto', 'pausado'))
        and exists (select * from convocatorias_universidad where convocatorias_carreras.convocatoria_universidad_id = convocatorias_universidad.convocatoria_universidad_id)
      limit 1) convocatoria
    inner join convocatorias_universidad proceso on proceso.convocatoria_universidad_id = convocatoria.convocatoria_universidad_id`)
  return row ? { period: row.period, institutionalPause: row.state === "pausado", deliveryOn: row.delivery_on } : null
}

export function createAcademicStructureRepository(): AcademicStructureRepository {
  return {
    activeCareer: findActiveCareer,
    careerLock: findCareerLock,
    async curriculumSubjects(careerId) {
      const found = await rows<SubjectRow>(sql`select asignatura_id::text as asignatura_id, codigo_asignatura, nombre_asignatura, ciclo_asignatura,
          orden_asignatura_en_ciclo, unidad_curricular_asignatura, modalidad_asignatura::text as modalidad_asignatura,
          creditos_asignatura::text as creditos_asignatura, total_horas_asignatura, horas_docencia::text as horas_docencia,
          horas_practicas::text as horas_practicas, horas_autonomas::text as horas_autonomas, asignatura_activa, genera_silabo_asignatura
        from asignaturas where asignaturas.carrera_id in (${careerId}::uuid)
        order by ciclo_asignatura asc, orden_asignatura_en_ciclo asc, nombre_asignatura asc`)
      return found.map(toSubject)
    },
    async requirements(subjectIds): Promise<RequirementRecord[]> {
      if (subjectIds.length === 0) return []
      const ids = uuidList(subjectIds)
      const found = await rows<{ id: string; asignatura_id: string; requisito_id: string; tipo: string }>(sql`select
          requisito_asignatura_id::text as id, asignatura_id::text as asignatura_id, requisito_id::text as requisito_id, tipo_requisito_asignatura as tipo
        from requisitos_asignatura where asignatura_id in (${ids}) and requisito_id in (${ids})
        order by tipo_requisito_asignatura asc, requisito_asignatura_id asc`)
      return found.map((row) => ({ id: row.id, subjectId: row.asignatura_id, requirementId: row.requisito_id, type: row.tipo }))
    },
    async teacherAssignments(careerId): Promise<TeacherAssignmentRecord[]> {
      const found = await rows<{ asignacion_paralelo_id: string; paralelo_id: string; asignacion_rol_id: string; asignacion_paralelo_activa: boolean }>(sql`select asignaciones_paralelo.* from asignaciones_paralelo
        where exists (select * from paralelos where asignaciones_paralelo.paralelo_id = paralelos.paralelo_id
          and exists (select * from asignaturas where paralelos.asignatura_id = asignaturas.asignatura_id and asignaturas.carrera_id = ${careerId}::uuid))
        order by asignaciones_paralelo.asignado_en desc`)
      if (found.length === 0) return []
      const roles = await rows<{ asignacion_rol_id: string; usuario_id: string }>(sql`select asignacion_rol_id::text as asignacion_rol_id, usuario_id::text as usuario_id
        from asignaciones_rol where asignacion_rol_id in (${uuidList([...new Set(found.map((row) => row.asignacion_rol_id))])})`)
      const userOfRole = new Map(roles.map((row) => [row.asignacion_rol_id, row.usuario_id]))
      const users = await usersById(roles.map((row) => row.usuario_id))
      const parallels = await rows<{ paralelo_id: string; codigo_paralelo: string; nombre_asignatura: string }>(sql`select paralelo.paralelo_id::text as paralelo_id,
          paralelo.codigo_paralelo, asignatura.nombre_asignatura
        from paralelos paralelo inner join asignaturas asignatura on asignatura.asignatura_id = paralelo.asignatura_id
        where paralelo.paralelo_id in (${uuidList([...new Set(found.map((row) => row.paralelo_id))])})`)
      const parallelById = new Map(parallels.map((row) => [row.paralelo_id, row]))
      return found.map((row) => {
        const user = users.get(userOfRole.get(row.asignacion_rol_id) ?? "")
        const parallel = parallelById.get(row.paralelo_id)
        return {
          id: row.asignacion_paralelo_id,
          userId: user?.usuario_id ?? "",
          userName: user?.nombre_usuario ?? "",
          userEmail: user?.correo_electronico ?? "",
          parallelId: row.paralelo_id,
          parallelCode: parallel?.codigo_paralelo ?? "",
          subjectName: parallel?.nombre_asignatura ?? "",
          active: row.asignacion_paralelo_activa,
        }
      })
    },
    async careerTeachers(careerId): Promise<CareerTeacherRecord[]> {
      const found = await rows<{ usuario_id: string }>(sql`select asignaciones_rol.* from asignaciones_rol
        where ${ROLE_SCOPE(careerId, sql`'docente'`)}
          and exists (select * from usuarios where asignaciones_rol.usuario_id = usuarios.usuario_id and usuarios.usuario_activo = true)`)
      const users = await usersById(found.map((row) => row.usuario_id))
      return found.flatMap((row) => {
        const user = users.get(row.usuario_id)
        return user
          ? [{ id: user.usuario_id, name: user.nombre_usuario, email: user.correo_electronico, verified: user.verified, hasActiveInvitation: user.invited }]
          : []
      })
    },
    async pendingTeachers(careerId): Promise<PersonRecord[]> {
      const found = await rows<{ usuario_id: string }>(sql`select asignaciones_rol.* from asignaciones_rol
        where ${ROLE_SCOPE(careerId, sql`'docente'`)}
          and exists (select * from usuarios where asignaciones_rol.usuario_id = usuarios.usuario_id and usuarios.usuario_activo = true
            and usuarios.correo_verificado_en is null)`)
      const users = await usersById(found.map((row) => row.usuario_id))
      return found.flatMap((row) => {
        const user = users.get(row.usuario_id)
        return user ? [{ id: user.usuario_id, name: user.nombre_usuario, email: user.correo_electronico }] : []
      })
    },
    async unassignedParallels(careerId) {
      const found = await rows<{ paralelo_id: string; codigo_paralelo: string; asignatura_id: string }>(sql`select paralelos.* from paralelos
        where exists (select * from asignaturas where paralelos.asignatura_id = asignaturas.asignatura_id and asignaturas.carrera_id = ${careerId}::uuid)
          and not exists (select * from asignaciones_paralelo where paralelos.paralelo_id = asignaciones_paralelo.paralelo_id
            and asignaciones_paralelo.asignacion_paralelo_activa = true)`)
      if (found.length === 0) return []
      const subjects = await rows<{ asignatura_id: string; nombre_asignatura: string }>(sql`select asignatura_id::text as asignatura_id, nombre_asignatura
        from asignaturas where asignatura_id in (${uuidList([...new Set(found.map((row) => row.asignatura_id))])})`)
      const names = new Map(subjects.map((row) => [row.asignatura_id, row.nombre_asignatura]))
      return found.map((row) => ({ id: row.paralelo_id, label: `${names.get(row.asignatura_id) ?? ""} · Paralelo ${row.codigo_paralelo}` }))
    },
    async teacherUsers(careerId): Promise<PersonRecord[]> {
      const found = await rows<{ usuario_id: string; nombre_usuario: string; correo_electronico: string }>(sql`select usuarios.usuario_id::text as usuario_id,
          usuarios.nombre_usuario, usuarios.correo_electronico
        from usuarios
        where usuarios.usuario_activo = true and usuarios.correo_verificado_en is not null
          and usuarios.usuario_id in (select asignaciones_rol.usuario_id from asignaciones_rol where ${ROLE_SCOPE(careerId, sql`'docente', 'coordinador'`)})
        order by usuarios.nombre_usuario asc`)
      return found.map((row) => ({ id: row.usuario_id, name: row.nombre_usuario, email: row.correo_electronico }))
    },
  }
}
