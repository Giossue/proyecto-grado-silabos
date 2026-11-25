import { Inject, Injectable } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import type { CareerReadinessFacts, SetupRepository } from "../../server/dashboard/setupChecklist"

@Injectable()
export class PrismaSetupRepository implements SetupRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async activeFacultyExists(): Promise<boolean> {
    return (await this.prisma.facultades.findFirst({ where: { facultad_activa: true }, select: { facultad_id: true } })) !== null
  }

  activeCareerCount(): Promise<number> {
    return this.prisma.carreras.count({ where: { carrera_activa: true } })
  }

  activeCareersWithoutCoordinator(): Promise<number> {
    return this.prisma.carreras.count({ where: { carrera_activa: true, asignaciones_rol: { none: { rol: "coordinador", asignacion_rol_activa: true } } } })
  }

  async activeUserWithRole(role: string): Promise<boolean> {
    const user = await this.prisma.usuarios.findFirst({ where: { usuario_activo: true, asignaciones_rol: { some: { asignacion_rol_activa: true, rol: role } } }, select: { usuario_id: true } })
    return user !== null
  }

  async processExists(): Promise<boolean> {
    return (await this.prisma.convocatorias_universidad.findFirst({ select: { convocatoria_universidad_id: true } })) !== null
  }

  async templateHasFields(templateId: string): Promise<boolean> {
    return (await this.prisma.definiciones_campo.findFirst({ where: { plantilla_id: templateId, vigente_en_plantilla: true }, select: { definicion_campo_id: true } })) !== null
  }

  async processSyllabusCounts(processId: string): Promise<{ total: number; approved: number; notStarted: number }> {
    const [row] = await this.prisma.$queryRaw<{ total: number; approved: number; notStarted: number }[]>`select count(*)::int as "total",
        (count(*) filter (where s.estado_silabo = 'aprobado'))::int as "approved", (count(*) filter (where s.estado_silabo = 'sin_iniciar'))::int as "notStarted"
      from silabos s
      where exists (select 1 from convocatorias_carreras cc where cc.convocatoria_carrera_id = s.convocatoria_carrera_id and cc.convocatoria_universidad_id = ${processId}::uuid
        and exists (select 1 from convocatorias_universidad cu where cu.convocatoria_universidad_id = cc.convocatoria_universidad_id))`
    return { total: row?.total ?? 0, approved: row?.approved ?? 0, notStarted: row?.notStarted ?? 0 }
  }

  careersWithoutConvocation(processId: string): Promise<number> {
    return this.prisma.carreras.count({
      where: { carrera_activa: true, convocatorias_carreras: { none: { convocatoria_universidad_id: processId, convocatorias_universidad: { is: {} } } } },
    })
  }

  async careerReadiness(careerId: string): Promise<CareerReadinessFacts | null> {
    const career = await this.prisma.carreras.findFirst({
      where: { carrera_id: careerId },
      select: { _count: { select: { asignaturas: true } }, facultades: { select: { facultad_id: true, archivos: { select: { disco: true, ruta_archivo: true, categoria: true } } } } },
    })
    if (!career) return null
    const subjects = await this.prisma.asignaturas.findMany({
      where: { asignatura_activa: true, genera_silabo_asignatura: true, carrera_id: careerId },
      select: { asignatura_id: true, paralelos: { select: { paralelo_id: true }, take: 1 } },
    })
    const [parallels] = await this.prisma.$queryRaw<{ total: number; withTeacher: number }[]>`select count(*)::int as "total",
        (count(*) filter (where exists (select 1 from asignaciones_paralelo ap
          inner join asignaciones_rol ar on ar.asignacion_rol_id = ap.asignacion_rol_id
          inner join usuarios u on u.usuario_id = ar.usuario_id
          where ap.paralelo_id = paralelos.paralelo_id and ap.asignacion_paralelo_activa = true and ar.asignacion_rol_activa = true and ar.rol = 'docente'
            and ar.carrera_id = ${careerId}::uuid and u.usuario_activo = true and u.correo_verificado_en is not null)))::int as "withTeacher"
      from paralelos
      where exists (select 1 from asignaturas a where a.asignatura_id = paralelos.asignatura_id and a.asignatura_activa = true and a.genera_silabo_asignatura = true and a.carrera_id = ${careerId}::uuid)`
    const faculty = career.facultades
    const logo = faculty.archivos
    return {
      subjectsCount: career._count.asignaturas,
      faculty: { id: faculty.facultad_id, logo: logo === null ? null : { disk: logo.disco, path: logo.ruta_archivo, classification: logo.categoria } },
      scheduledSubjectIds: subjects.map((subject) => subject.asignatura_id),
      scheduledWithParallels: subjects.filter((subject) => subject.paralelos.length > 0).length,
      parallelTotal: parallels?.total ?? 0,
      parallelsWithTeacher: parallels?.withTeacher ?? 0,
    }
  }

  async careerHasActiveTeacher(careerId: string): Promise<boolean> {
    const teacher = await this.prisma.asignaciones_rol.findFirst({
      where: { asignacion_rol_activa: true, rol: "docente", carrera_id: careerId, usuarios: { is: { usuario_activo: true, correo_verificado_en: { not: null } } } },
      select: { asignacion_rol_id: true },
    })
    return teacher !== null
  }
}
