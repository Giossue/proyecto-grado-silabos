import { Inject, Injectable } from "@nestjs/common"
import { Prisma } from "../../../generated/prisma/client"
import { PrismaService } from "../../../prisma/prisma.service"
import { uuidList } from "../../../prisma/sql"
import { IN_PROGRESS, SYLLABUS_SCOPE, TOUCHED_SYLLABUS } from "../../../server/academic/academicSql"
import { openCurriculum } from "../../../server/syllabus/syllabusSql"
import type { CareerParallelRecord, ScheduledSubjectRecord, ScheduledSubjectsRepository } from "../../../server/academic/scheduledSubjects"

type SubjectRow = { id: string; codigo: string; nombre: string; ciclo: number | null; activo: boolean; genera: boolean; modalidad: string | null; malla: string }

@Injectable()
export class ScheduledSubjectsPrismaRepository implements ScheduledSubjectsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async parallelIds(parallels: string[], condition: Prisma.Sql): Promise<string[]> {
    if (parallels.length === 0) return []
    const found = await this.prisma.$queryRaw<{ id: string }[]>`select silabos.paralelo_id::text as id from silabos
      where silabos.paralelo_id in (${uuidList(parallels)}) and ${condition} and ${SYLLABUS_SCOPE}`
    return [...new Set(found.map((row) => row.id))]
  }

  async careerParallels(careerId: string): Promise<CareerParallelRecord[]> {
    const found = await this.prisma.$queryRaw<{ id: string; asignatura_id: string; codigo: string; jornada: string | null }[]>`select paralelos.paralelo_id::text as id,
        paralelos.asignatura_id::text as asignatura_id, paralelos.codigo_paralelo as codigo, paralelos.jornada_paralelo as jornada
      from paralelos where exists (select * from asignaturas where paralelos.asignatura_id = asignaturas.asignatura_id and carrera_id = ${careerId}::uuid
        and ${openCurriculum("asignaturas")})
      order by codigo_paralelo asc`
    return found.map((row) => ({ id: row.id, subjectId: row.asignatura_id, code: row.codigo, shift: row.jornada }))
  }

  parallelsWithSyllabus(parallels: string[]): Promise<string[]> {
    return this.parallelIds(parallels, TOUCHED_SYLLABUS)
  }

  async parallelsWithTeacher(parallels: string[]): Promise<string[]> {
    if (parallels.length === 0) return []
    const found = await this.prisma.$queryRaw<{ id: string }[]>`select paralelo_id::text as id from asignaciones_paralelo where paralelo_id in (${uuidList(parallels)})`
    return [...new Set(found.map((row) => row.id))]
  }

  parallelsWithSentSyllabus(parallels: string[]): Promise<string[]> {
    return this.parallelIds(parallels, Prisma.sql`${IN_PROGRESS} and silabos.estado_silabo in ('en_revision', 'aprobado')`)
  }

  parallelsWithStartedSyllabus(parallels: string[]): Promise<string[]> {
    return this.parallelIds(parallels, Prisma.sql`${IN_PROGRESS} and (silabos.estado_silabo != 'sin_iniciar' or silabos.iniciado_en is not null)`)
  }

  async careerSubjects(careerId: string): Promise<ScheduledSubjectRecord[]> {
    const found = await this.prisma.$queryRaw<SubjectRow[]>`select asignatura.asignatura_id::text as id, asignatura.codigo_asignatura as codigo, asignatura.nombre_asignatura as nombre,
        asignatura.ciclo_asignatura as ciclo, asignatura.asignatura_activa as activo, asignatura.genera_silabo_asignatura as genera,
        coalesce(asignatura.modalidad_asignatura::text, carrera.modalidad_carrera::text) as modalidad, malla.nombre_malla as malla
      from asignaturas asignatura
      inner join mallas malla on malla.malla_id = asignatura.malla_id
      left join carreras carrera on carrera.carrera_id = asignatura.carrera_id
      where asignatura.carrera_id = ${careerId}::uuid and malla.estado_malla <> 'cerrada'
      order by (malla.estado_malla = 'vigente') desc, malla.nombre_malla asc, asignatura.ciclo_asignatura asc, asignatura.orden_asignatura_en_ciclo asc, asignatura.nombre_asignatura asc`
    return found.map((row) => ({
      id: row.id,
      code: row.codigo,
      name: row.nombre,
      cycle: row.ciclo === null ? null : Number(row.ciclo),
      active: row.activo,
      generatesSyllabus: row.genera,
      modality: row.modalidad,
      mallaName: row.malla,
    }))
  }
}
