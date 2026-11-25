import "server-only"
import { and, asc, desc, eq, exists, gt, inArray, isNotNull, isNull, notExists, sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import {
  asignacionesParalelo,
  asignacionesRol,
  asignaturas,
  carreras,
  convocatoriasCarreras,
  convocatoriasUniversidad,
  invitacionesActivacion,
  paralelos,
  periodosAcademicos,
  requisitosAsignatura,
  usuarios,
} from "@/db/schema"
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

type UserRow = { id: string; name: string; email: string; verified: boolean; invited: boolean }

async function usersById(ids: string[]): Promise<Map<string, UserRow>> {
  if (ids.length === 0) return new Map()
  const found = await db
    .select({
      id: usuarios.usuarioId,
      name: usuarios.nombreUsuario,
      email: usuarios.correoElectronico,
      verified: isNotNull(usuarios.correoVerificadoEn).mapWith(Boolean),
      invited: sql<boolean>`${exists(
        db
          .select({ id: invitacionesActivacion.invitacionActivacionId })
          .from(invitacionesActivacion)
          .where(
            and(
              eq(invitacionesActivacion.usuarioId, usuarios.usuarioId),
              isNull(invitacionesActivacion.usadaEn),
              isNull(invitacionesActivacion.invalidadaEn),
              gt(invitacionesActivacion.expiraEn, sql`now()`),
            ),
          ),
      )}`,
    })
    .from(usuarios)
    .where(inArray(usuarios.usuarioId, [...new Set(ids)]))
  return new Map(found.map((row) => [row.id, row]))
}

const SUBJECT = {
  id: asignaturas.asignaturaId,
  code: asignaturas.codigoAsignatura,
  name: asignaturas.nombreAsignatura,
  cycle: asignaturas.cicloAsignatura,
  position: asignaturas.ordenAsignaturaEnCiclo,
  organizationUnit: asignaturas.unidadCurricularAsignatura,
  modality: asignaturas.modalidadAsignatura,
  credits: asignaturas.creditosAsignatura,
  totalHours: asignaturas.totalHorasAsignatura,
  hoursAc: asignaturas.horasDocencia,
  hoursPae: asignaturas.horasPracticas,
  hoursAa: asignaturas.horasAutonomas,
  active: asignaturas.asignaturaActiva,
  generatesSyllabus: asignaturas.generaSilaboAsignatura,
}

function toSubject(row: SubjectRecord): SubjectRecord {
  return {
    ...row,
    cycle: row.cycle === null ? null : Number(row.cycle),
    position: Number(row.position),
    totalHours: row.totalHours === null ? null : Number(row.totalHours),
  }
}

const roleScope = (careerId: string, roles: string[]) =>
  and(eq(asignacionesRol.asignacionRolActiva, true), eq(asignacionesRol.carreraId, careerId), inArray(asignacionesRol.rol, roles))

const parallelInCareer = (careerId: string) =>
  exists(db.select({ id: asignaturas.asignaturaId }).from(asignaturas).where(and(eq(paralelos.asignaturaId, asignaturas.asignaturaId), eq(asignaturas.carreraId, careerId))))

async function careerRoleUsers(careerId: string, user: SQL | undefined): Promise<string[]> {
  const found = await db
    .select({ userId: asignacionesRol.usuarioId })
    .from(asignacionesRol)
    .where(
      and(
        roleScope(careerId, ["docente"]),
        exists(db.select({ id: usuarios.usuarioId }).from(usuarios).where(and(eq(asignacionesRol.usuarioId, usuarios.usuarioId), eq(usuarios.usuarioActivo, true), user))),
      ),
    )
  return found.map((row) => row.userId)
}

export async function findActiveCareer(careerId: string): Promise<CareerRecord | null> {
  const [row] = await db
    .select({ id: carreras.carreraId, name: carreras.nombreCarrera, modality: carreras.modalidadCarrera, cycleCount: carreras.numeroCiclos })
    .from(carreras)
    .where(and(eq(carreras.carreraActiva, true), eq(carreras.carreraId, careerId)))
    .limit(1)
  return row ? { ...row, cycleCount: Number(row.cycleCount) } : null
}

export async function findCareerLock(careerId: string): Promise<CareerLock | null> {
  const [row] = await db
    .select({
      period: periodosAcademicos.codigoPeriodoAcademico,
      state: convocatoriasUniversidad.estadoConvocatoriaUniversidad,
      deliveryOn: sql<string>`to_char(${convocatoriasUniversidad.fechaEntrega} at time zone ${institutionTimezone()}, 'YYYY-MM-DD')`,
    })
    .from(convocatoriasCarreras)
    .innerJoin(convocatoriasUniversidad, eq(convocatoriasUniversidad.convocatoriaUniversidadId, convocatoriasCarreras.convocatoriaUniversidadId))
    .leftJoin(periodosAcademicos, eq(periodosAcademicos.periodoAcademicoId, convocatoriasUniversidad.periodoAcademicoId))
    .where(
      and(
        eq(convocatoriasCarreras.carreraId, careerId),
        eq(convocatoriasCarreras.estadoConvocatoriaCarrera, "abierta"),
        inArray(convocatoriasUniversidad.estadoConvocatoriaUniversidad, ["abierto", "pausado"]),
      ),
    )
    .limit(1)
  return row ? { period: row.period, institutionalPause: row.state === "pausado", deliveryOn: row.deliveryOn } : null
}

export function createAcademicStructureRepository(): AcademicStructureRepository {
  return {
    activeCareer: findActiveCareer,
    careerLock: findCareerLock,
    async curriculumSubjects(careerId) {
      const found = await db
        .select(SUBJECT)
        .from(asignaturas)
        .where(eq(asignaturas.carreraId, careerId))
        .orderBy(asc(asignaturas.cicloAsignatura), asc(asignaturas.ordenAsignaturaEnCiclo), asc(asignaturas.nombreAsignatura))
      return found.map(toSubject)
    },
    async requirements(subjectIds): Promise<RequirementRecord[]> {
      if (subjectIds.length === 0) return []
      return db
        .select({
          id: requisitosAsignatura.requisitoAsignaturaId,
          subjectId: requisitosAsignatura.asignaturaId,
          requirementId: requisitosAsignatura.requisitoId,
          type: requisitosAsignatura.tipoRequisitoAsignatura,
        })
        .from(requisitosAsignatura)
        .where(and(inArray(requisitosAsignatura.asignaturaId, subjectIds), inArray(requisitosAsignatura.requisitoId, subjectIds)))
        .orderBy(asc(requisitosAsignatura.tipoRequisitoAsignatura), asc(requisitosAsignatura.requisitoAsignaturaId))
    },
    async teacherAssignments(careerId): Promise<TeacherAssignmentRecord[]> {
      const found = await db
        .select({
          id: asignacionesParalelo.asignacionParaleloId,
          parallelId: asignacionesParalelo.paraleloId,
          roleId: asignacionesParalelo.asignacionRolId,
          active: asignacionesParalelo.asignacionParaleloActiva,
        })
        .from(asignacionesParalelo)
        .where(exists(db.select({ id: paralelos.paraleloId }).from(paralelos).where(and(eq(asignacionesParalelo.paraleloId, paralelos.paraleloId), parallelInCareer(careerId)))))
        .orderBy(desc(asignacionesParalelo.asignadoEn))
      if (found.length === 0) return []
      const roles = await db
        .select({ id: asignacionesRol.asignacionRolId, userId: asignacionesRol.usuarioId })
        .from(asignacionesRol)
        .where(inArray(asignacionesRol.asignacionRolId, [...new Set(found.map((row) => row.roleId))]))
      const userOfRole = new Map(roles.map((row) => [row.id, row.userId]))
      const users = await usersById(roles.map((row) => row.userId))
      const parallels = await db
        .select({ id: paralelos.paraleloId, code: paralelos.codigoParalelo, subject: asignaturas.nombreAsignatura })
        .from(paralelos)
        .innerJoin(asignaturas, eq(asignaturas.asignaturaId, paralelos.asignaturaId))
        .where(inArray(paralelos.paraleloId, [...new Set(found.map((row) => row.parallelId))]))
      const parallelById = new Map(parallels.map((row) => [row.id, row]))
      return found.map((row) => {
        const user = users.get(userOfRole.get(row.roleId) ?? "")
        const parallel = parallelById.get(row.parallelId)
        return {
          id: row.id,
          userId: user?.id ?? "",
          userName: user?.name ?? "",
          userEmail: user?.email ?? "",
          parallelId: row.parallelId,
          parallelCode: parallel?.code ?? "",
          subjectName: parallel?.subject ?? "",
          active: row.active,
        }
      })
    },
    async careerTeachers(careerId): Promise<CareerTeacherRecord[]> {
      const found = await careerRoleUsers(careerId, undefined)
      const users = await usersById(found)
      return found.flatMap((userId) => {
        const user = users.get(userId)
        return user ? [{ id: user.id, name: user.name, email: user.email, verified: user.verified, hasActiveInvitation: user.invited }] : []
      })
    },
    async pendingTeachers(careerId): Promise<PersonRecord[]> {
      const found = await careerRoleUsers(careerId, isNull(usuarios.correoVerificadoEn))
      const users = await usersById(found)
      return found.flatMap((userId) => {
        const user = users.get(userId)
        return user ? [{ id: user.id, name: user.name, email: user.email }] : []
      })
    },
    async unassignedParallels(careerId) {
      const found = await db
        .select({ id: paralelos.paraleloId, code: paralelos.codigoParalelo, subjectId: paralelos.asignaturaId })
        .from(paralelos)
        .where(
          and(
            parallelInCareer(careerId),
            notExists(
              db
                .select({ id: asignacionesParalelo.asignacionParaleloId })
                .from(asignacionesParalelo)
                .where(and(eq(paralelos.paraleloId, asignacionesParalelo.paraleloId), eq(asignacionesParalelo.asignacionParaleloActiva, true))),
            ),
          ),
        )
      if (found.length === 0) return []
      const subjects = await db
        .select({ id: asignaturas.asignaturaId, name: asignaturas.nombreAsignatura })
        .from(asignaturas)
        .where(inArray(asignaturas.asignaturaId, [...new Set(found.map((row) => row.subjectId))]))
      const names = new Map(subjects.map((row) => [row.id, row.name]))
      return found.map((row) => ({ id: row.id, label: `${names.get(row.subjectId) ?? ""} · Paralelo ${row.code}` }))
    },
    async teacherUsers(careerId): Promise<PersonRecord[]> {
      return db
        .select({ id: usuarios.usuarioId, name: usuarios.nombreUsuario, email: usuarios.correoElectronico })
        .from(usuarios)
        .where(
          and(
            eq(usuarios.usuarioActivo, true),
            isNotNull(usuarios.correoVerificadoEn),
            inArray(usuarios.usuarioId, db.select({ id: asignacionesRol.usuarioId }).from(asignacionesRol).where(roleScope(careerId, ["docente", "coordinador"]))),
          ),
        )
        .orderBy(asc(usuarios.nombreUsuario))
    },
  }
}
