import { Inject, Injectable } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import type { CareerReadinessFacts, SetupRepository } from "../../server/dashboard/setupChecklist"
import { setupRepositoryOn } from "../../server/dashboard/setupQueries"

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

  // Same query as the server repository, so both count the subjects of every malla that is not closed.
  careerReadiness(careerId: string): Promise<CareerReadinessFacts | null> {
    return setupRepositoryOn(this.prisma).careerReadiness(careerId)
  }

  async careerHasActiveTeacher(careerId: string): Promise<boolean> {
    const teacher = await this.prisma.asignaciones_rol.findFirst({
      where: { asignacion_rol_activa: true, rol: "docente", carrera_id: careerId, usuarios: { is: { usuario_activo: true, correo_verificado_en: { not: null } } } },
      select: { asignacion_rol_id: true },
    })
    return teacher !== null
  }
}
