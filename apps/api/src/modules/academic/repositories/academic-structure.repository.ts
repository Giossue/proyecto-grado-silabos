import { Inject, Injectable } from "@nestjs/common"
import { Prisma } from "../../../generated/prisma/client"
import { PrismaService } from "../../../prisma/prisma.service"
import type {
  AcademicStructureRepository,
  CareerLock,
  CareerRecord,
  CareerTeacherRecord,
  MallaReadRepository,
  MallaRecord,
  PersonRecord,
  RequirementRecord,
  SubjectRecord,
  TeacherAssignmentRecord,
} from "../../../server/academic/structure"
import { subjectTotalHours } from "../../../server/academic/subjectHours"
import { decimalText } from "./prisma-values"

const institutionTimezone = () => process.env.DISPLAY_TIMEZONE ?? "America/Guayaquil"

type UserRow = { id: string; name: string; email: string; verified: boolean; invited: boolean }

const SUBJECT_COLUMNS = {
  asignatura_id: true,
  codigo_asignatura: true,
  nombre_asignatura: true,
  ciclo_asignatura: true,
  orden_asignatura_en_ciclo: true,
  unidad_curricular_asignatura: true,
  modalidad_asignatura: true,
  creditos_asignatura: true,
  horas_docencia: true,
  horas_practicas: true,
  horas_autonomas: true,
  asignatura_activa: true,
  genera_silabo_asignatura: true,
} satisfies Prisma.asignaturasSelect

type SubjectRow = Prisma.asignaturasGetPayload<{ select: typeof SUBJECT_COLUMNS }>

function toSubject(row: SubjectRow): SubjectRecord {
  return {
    id: row.asignatura_id,
    code: row.codigo_asignatura,
    name: row.nombre_asignatura,
    cycle: row.ciclo_asignatura,
    position: row.orden_asignatura_en_ciclo,
    organizationUnit: row.unidad_curricular_asignatura,
    modality: row.modalidad_asignatura,
    credits: decimalText(row.creditos_asignatura),
    totalHours: subjectTotalHours(row.horas_docencia, row.horas_practicas, row.horas_autonomas),
    hoursAc: decimalText(row.horas_docencia),
    hoursPae: decimalText(row.horas_practicas),
    hoursAa: decimalText(row.horas_autonomas),
    active: row.asignatura_activa,
    generatesSyllabus: row.genera_silabo_asignatura,
  }
}

const MALLA_COLUMNS = {
  malla_id: true,
  carrera_id: true,
  codigo_malla: true,
  numero_ciclos: true,
  estado_malla: true,
  _count: { select: { asignaturas: true } },
} satisfies Prisma.mallasSelect

function toMalla(row: Prisma.mallasGetPayload<{ select: typeof MALLA_COLUMNS }>): MallaRecord {
  return {
    id: row.malla_id,
    careerId: row.carrera_id,
    code: row.codigo_malla,
    cycleCount: row.numero_ciclos,
    state: row.estado_malla,
    subjectCount: row._count.asignaturas,
  }
}

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

const roleScope = (careerId: string, roles: string[]): Prisma.asignaciones_rolWhereInput => ({ asignacion_rol_activa: true, carrera_id: careerId, rol: { in: roles } })

@Injectable()
export class AcademicStructurePrismaRepository implements AcademicStructureRepository, MallaReadRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async usersById(ids: string[]): Promise<Map<string, UserRow>> {
    if (ids.length === 0) return new Map()
    const unique = [...new Set(ids)]
    const found = await this.prisma.$queryRaw<UserRow[]>`select usuarios.usuario_id::text as id, usuarios.nombre_usuario as name, usuarios.correo_electronico as email,
        (usuarios.correo_verificado_en is not null) as verified,
        exists (select invitaciones_activacion.invitacion_activacion_id from invitaciones_activacion
          where invitaciones_activacion.usuario_id = usuarios.usuario_id and invitaciones_activacion.usada_en is null
            and invitaciones_activacion.invalidada_en is null and invitaciones_activacion.expira_en > now()) as invited
      from usuarios where usuarios.usuario_id in (${Prisma.join(unique.map((id) => Prisma.sql`${id}::uuid`))})`
    return new Map(found.map((row) => [row.id, row]))
  }

  private async careerRoleUsers(careerId: string, onlyUnverified: boolean): Promise<string[]> {
    const found = await this.prisma.asignaciones_rol.findMany({
      where: { ...roleScope(careerId, ["docente"]), usuarios: { usuario_activo: true, ...(onlyUnverified ? { correo_verificado_en: null } : {}) } },
      select: { usuario_id: true },
    })
    return found.map((row) => row.usuario_id)
  }

  async activeCareer(careerId: string): Promise<CareerRecord | null> {
    const row = await this.prisma.carreras.findFirst({
      where: { carrera_activa: true, carrera_id: careerId },
      select: { carrera_id: true, nombre_carrera: true, modalidad_carrera: true, mallas: { where: { estado_malla: "vigente" }, orderBy: { numero_ciclos: "desc" }, take: 1, select: { numero_ciclos: true } } },
    })
    return row ? { id: row.carrera_id, name: row.nombre_carrera, modality: row.modalidad_carrera, cycleCount: row.mallas[0]?.numero_ciclos ?? 0 } : null
  }

  async mallas(careerId: string): Promise<MallaRecord[]> {
    const found = await this.prisma.mallas.findMany({ where: { carrera_id: careerId }, select: MALLA_COLUMNS, orderBy: { codigo_malla: "asc" } })
    return found.map(toMalla)
  }

  async malla(careerId: string, mallaId: string): Promise<MallaRecord | null> {
    if (!UUID.test(mallaId)) return null
    const row = await this.prisma.mallas.findFirst({ where: { carrera_id: careerId, malla_id: mallaId }, select: MALLA_COLUMNS })
    return row ? toMalla(row) : null
  }

  async careerLock(careerId: string): Promise<CareerLock | null> {
    const [row] = await this.prisma.$queryRaw<{ period: string | null; state: string; delivery_on: string }[]>`select periodos_academicos.codigo_periodo_academico as period,
        convocatorias_universidad.estado_convocatoria_universidad as state,
        to_char(convocatorias_universidad.fecha_entrega at time zone ${institutionTimezone()}, 'YYYY-MM-DD') as delivery_on
      from convocatorias_carreras
      inner join convocatorias_universidad on convocatorias_universidad.convocatoria_universidad_id = convocatorias_carreras.convocatoria_universidad_id
      left join periodos_academicos on periodos_academicos.periodo_academico_id = convocatorias_universidad.periodo_academico_id
      where convocatorias_carreras.carrera_id = ${careerId}::uuid and convocatorias_carreras.estado_convocatoria_carrera = 'abierto'
        and convocatorias_universidad.estado_convocatoria_universidad in ('abierto', 'pausado')
      limit 1`
    return row ? { period: row.period, institutionalPause: row.state === "pausado", deliveryOn: row.delivery_on } : null
  }

  async curriculumSubjects(mallaId: string): Promise<SubjectRecord[]> {
    const found = await this.prisma.asignaturas.findMany({
      where: { malla_id: mallaId },
      select: SUBJECT_COLUMNS,
      orderBy: [{ ciclo_asignatura: "asc" }, { orden_asignatura_en_ciclo: "asc" }, { nombre_asignatura: "asc" }],
    })
    return found.map(toSubject)
  }

  async requirements(subjectIds: string[]): Promise<RequirementRecord[]> {
    if (subjectIds.length === 0) return []
    const found = await this.prisma.requisitos_asignatura.findMany({
      where: { asignatura_id: { in: subjectIds }, requisito_id: { in: subjectIds } },
      select: { requisito_asignatura_id: true, asignatura_id: true, requisito_id: true },
      orderBy: { requisito_asignatura_id: "asc" },
    })
    return found.map((row) => ({ id: row.requisito_asignatura_id, subjectId: row.asignatura_id, requirementId: row.requisito_id }))
  }

  async teacherAssignments(careerId: string): Promise<TeacherAssignmentRecord[]> {
    const found = await this.prisma.asignaciones_paralelo.findMany({
      where: { paralelos: { asignaturas: { carrera_id: careerId } } },
      select: { asignacion_paralelo_id: true, paralelo_id: true, asignacion_rol_id: true, asignacion_paralelo_activa: true },
      orderBy: { asignado_en: "desc" },
    })
    if (found.length === 0) return []
    const roles = await this.prisma.asignaciones_rol.findMany({
      where: { asignacion_rol_id: { in: [...new Set(found.map((row) => row.asignacion_rol_id))] } },
      select: { asignacion_rol_id: true, usuario_id: true },
    })
    const userOfRole = new Map(roles.map((row) => [row.asignacion_rol_id, row.usuario_id]))
    const users = await this.usersById(roles.map((row) => row.usuario_id))
    const parallels = await this.prisma.paralelos.findMany({
      where: { paralelo_id: { in: [...new Set(found.map((row) => row.paralelo_id))] } },
      select: { paralelo_id: true, codigo_paralelo: true, asignaturas: { select: { nombre_asignatura: true } } },
    })
    const parallelById = new Map(parallels.map((row) => [row.paralelo_id, row]))
    return found.map((row) => {
      const user = users.get(userOfRole.get(row.asignacion_rol_id) ?? "")
      const parallel = parallelById.get(row.paralelo_id)
      return {
        id: row.asignacion_paralelo_id,
        userId: user?.id ?? "",
        userName: user?.name ?? "",
        userEmail: user?.email ?? "",
        parallelId: row.paralelo_id,
        parallelCode: parallel?.codigo_paralelo ?? "",
        subjectName: parallel?.asignaturas.nombre_asignatura ?? "",
        active: row.asignacion_paralelo_activa,
      }
    })
  }

  async careerTeachers(careerId: string): Promise<CareerTeacherRecord[]> {
    const found = await this.careerRoleUsers(careerId, false)
    const users = await this.usersById(found)
    return found.flatMap((userId) => {
      const user = users.get(userId)
      return user ? [{ id: user.id, name: user.name, email: user.email, verified: user.verified, hasActiveInvitation: user.invited }] : []
    })
  }

  async pendingTeachers(careerId: string): Promise<PersonRecord[]> {
    const found = await this.careerRoleUsers(careerId, true)
    const users = await this.usersById(found)
    return found.flatMap((userId) => {
      const user = users.get(userId)
      return user ? [{ id: user.id, name: user.name, email: user.email }] : []
    })
  }

  async unassignedParallels(careerId: string): Promise<{ id: string; label: string }[]> {
    const found = await this.prisma.$queryRaw<{ paralelo_id: string; codigo_paralelo: string; asignatura_id: string }[]>`select "paralelos"."paralelo_id"::text as paralelo_id,
        "paralelos"."codigo_paralelo", "paralelos"."asignatura_id"::text as asignatura_id
      from "paralelos"
      where (exists (select "asignatura_id" from "asignaturas" where ("paralelos"."asignatura_id" = "asignaturas"."asignatura_id" and "asignaturas"."carrera_id" = ${careerId}::uuid))
        and not exists (select "asignacion_paralelo_id" from "asignaciones_paralelo"
          where ("paralelos"."paralelo_id" = "asignaciones_paralelo"."paralelo_id" and "asignaciones_paralelo"."asignacion_paralelo_activa" = true)))`
    if (found.length === 0) return []
    const subjects = await this.prisma.asignaturas.findMany({
      where: { asignatura_id: { in: [...new Set(found.map((row) => row.asignatura_id))] } },
      select: { asignatura_id: true, nombre_asignatura: true },
    })
    const names = new Map(subjects.map((row) => [row.asignatura_id, row.nombre_asignatura]))
    return found.map((row) => ({ id: row.paralelo_id, label: `${names.get(row.asignatura_id) ?? ""} · Paralelo ${row.codigo_paralelo}` }))
  }

  async teacherUsers(careerId: string): Promise<PersonRecord[]> {
    const found = await this.prisma.usuarios.findMany({
      where: { usuario_activo: true, correo_verificado_en: { not: null }, asignaciones_rol: { some: roleScope(careerId, ["docente", "coordinador"]) } },
      select: { usuario_id: true, nombre_usuario: true, correo_electronico: true },
      orderBy: { nombre_usuario: "asc" },
    })
    return found.map((row) => ({ id: row.usuario_id, name: row.nombre_usuario, email: row.correo_electronico }))
  }
}
