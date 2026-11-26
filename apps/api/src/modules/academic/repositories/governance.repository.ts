import { Inject, Injectable } from "@nestjs/common"
import { PrismaService } from "../../../prisma/prisma.service"
import { phpJsonDecode } from "../../../server/configuration/phpValues"
import type { CareerRoleCount, GovernanceCareer, GovernanceFaculty, GovernancePeriod, GovernanceProcess, GovernanceRepository } from "../../../server/academic/governance"
import { plainDate } from "./prisma-values"

type FacultyRow = { id: string; name: string; libraries: string | null; has_logo: boolean; disk: string | null; path: string | null; classification: string | null; active: boolean }

@Injectable()
export class GovernancePrismaRepository implements GovernanceRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async processes(): Promise<GovernanceProcess[]> {
    const rows = await this.prisma.convocatorias_universidad.findMany({
      select: { convocatoria_universidad_id: true, periodo_academico_id: true, estado_convocatoria_universidad: true },
    })
    return rows.map((row) => ({ id: row.convocatoria_universidad_id, periodId: row.periodo_academico_id, state: row.estado_convocatoria_universidad }))
  }

  async faculties(): Promise<GovernanceFaculty[]> {
    const found = await this.prisma.$queryRaw<FacultyRow[]>`select facultades.facultad_id::text as id, facultades.nombre_facultad as name,
        facultades.bibliotecas_koha_facultad::text as libraries, facultades.facultad_activa as active,
        (archivos.archivo_id is not null) as has_logo, archivos.disco as disk, archivos.ruta_archivo as path, archivos.categoria as classification
      from facultades
      left join archivos on archivos.archivo_id = facultades.logo_archivo_id
      order by facultades.nombre_facultad asc`
    return found.map((row) => ({
      id: row.id,
      name: row.name,
      libraries: phpJsonDecode(row.libraries),
      active: row.active,
      logo: row.has_logo ? { disk: row.disk ?? "private", path: row.path, classification: row.classification } : null,
    }))
  }

  async careers(): Promise<GovernanceCareer[]> {
    const found = await this.prisma.carreras.findMany({
      select: {
        carrera_id: true,
        facultad_id: true,
        modalidad_carrera: true,
        codigo_carrera: true,
        nombre_carrera: true,
        carrera_activa: true,
        asignaciones_rol: {
          where: { rol: "coordinador", asignacion_rol_activa: true },
          take: 1,
          select: { usuarios: { select: { usuario_id: true, nombre_usuario: true } } },
        },
      },
      orderBy: { nombre_carrera: "asc" },
    })
    return found.map((row) => {
      const coordinator = row.asignaciones_rol[0]?.usuarios ?? null
      return {
        id: row.carrera_id,
        facultyId: row.facultad_id,
        coordinator: coordinator === null ? null : { id: coordinator.usuario_id, name: coordinator.nombre_usuario },
        modality: row.modalidad_carrera,
        code: row.codigo_carrera,
        name: row.nombre_carrera,
        active: row.carrera_activa,
      }
    })
  }

  async periods(): Promise<GovernancePeriod[]> {
    const found = await this.prisma.periodos_academicos.findMany({
      select: { periodo_academico_id: true, codigo_periodo_academico: true, fecha_inicio_periodo: true, fecha_fin_periodo: true, cantidad_semanas_lectivas: true },
      orderBy: { fecha_inicio_periodo: "desc" },
    })
    return found.map((row) => ({
      id: row.periodo_academico_id,
      code: row.codigo_periodo_academico,
      startsOn: plainDate(row.fecha_inicio_periodo),
      endsOn: plainDate(row.fecha_fin_periodo),
      teachingWeeks: row.cantidad_semanas_lectivas,
    }))
  }

  async facultiesWithActiveCareers(facultyIds: string[]): Promise<string[]> {
    const found = await this.prisma.carreras.findMany({ where: { facultad_id: { in: facultyIds }, carrera_activa: true }, select: { facultad_id: true }, distinct: ["facultad_id"] })
    return found.map((row) => row.facultad_id)
  }

  async careersInRunningConvocation(careerIds: string[]): Promise<string[]> {
    const found = await this.prisma.convocatorias_carreras.findMany({
      where: {
        carrera_id: { in: careerIds },
        estado_convocatoria_carrera: { not: "cerrada" },
        convocatorias_universidad: { estado_convocatoria_universidad: { not: "cerrado" } },
      },
      select: { carrera_id: true },
      distinct: ["carrera_id"],
    })
    return found.map((row) => row.carrera_id)
  }

  async careerRoleCounts(careerIds: string[]): Promise<CareerRoleCount[]> {
    if (careerIds.length === 0) return []
    const found = await this.prisma.asignaciones_rol.groupBy({
      by: ["carrera_id", "rol"],
      where: { carrera_id: { in: careerIds }, asignacion_rol_activa: true },
      _count: { _all: true },
    })
    return found.map((row) => ({ careerId: row.carrera_id as string, role: row.rol, total: row._count._all }))
  }
}
