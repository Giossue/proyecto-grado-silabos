import { Inject, Injectable } from "@nestjs/common"
import type { DestinationLookups } from "../../server/operations/notificationDestination"
import type { Prisma } from "../../generated/prisma/client"
import { PrismaService } from "../../prisma/prisma.service"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const visibleConvocation: Prisma.convocatorias_carrerasWhereInput = { convocatorias_universidad: { is: {} } }
const visibleSyllabus: Prisma.silabosWhereInput = { convocatorias_carreras: { is: visibleConvocation } }

@Injectable()
export class NotificationDestinationsRepository implements DestinationLookups {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async processCareerIds(processId: string): Promise<string[]> {
    if (!UUID.test(processId)) return []
    const rows = await this.prisma.convocatorias_carreras.findMany({ where: { convocatoria_universidad_id: processId, ...visibleConvocation }, select: { carrera_id: true } })
    return rows.map((row) => row.carrera_id)
  }

  async convocationCareerIds(convocationId: string): Promise<string[]> {
    if (!UUID.test(convocationId)) return []
    const rows = await this.prisma.convocatorias_carreras.findMany({ where: { convocatoria_carrera_id: convocationId, ...visibleConvocation }, select: { carrera_id: true } })
    return rows.map((row) => row.carrera_id)
  }

  async syllabusExists(syllabusId: string): Promise<boolean> {
    if (!UUID.test(syllabusId)) return false
    return (await this.prisma.silabos.count({ where: { silabo_id: syllabusId, ...visibleSyllabus } })) > 0
  }

  async syllabusCareerId(syllabusId: string): Promise<string | null> {
    if (!UUID.test(syllabusId)) return null
    const row = await this.prisma.silabos.findFirst({ where: { silabo_id: syllabusId, ...visibleSyllabus }, select: { convocatorias_carreras: { select: { carrera_id: true } } } })
    return row?.convocatorias_carreras.carrera_id ?? null
  }

  async latestRevisionId(syllabusId: string): Promise<string | null> {
    if (!UUID.test(syllabusId)) return null
    const row = await this.prisma.revisiones_silabo.findFirst({
      where: { silabo_id: syllabusId, silabos: { is: visibleSyllabus } },
      orderBy: { numero_revision: "desc" },
      select: { revision_silabo_id: true },
    })
    return row?.revision_silabo_id ?? null
  }

  async teacherAssignmentIds(syllabusId: string, userId: string): Promise<string[]> {
    if (!UUID.test(syllabusId)) return []
    const rows = await this.prisma.docentes_vigentes_silabo.findMany({ where: { silabo_id: syllabusId, usuario_id: userId }, select: { asignacion_rol_id: true } })
    return rows.map((row) => row.asignacion_rol_id)
  }

  async artifactRevision(artifactId: string): Promise<{ revisionId: string; syllabusId: string } | null> {
    if (!UUID.test(artifactId)) return null
    const row = await this.prisma.exportaciones_silabo.findFirst({
      where: { exportacion_silabo_id: artifactId, revisiones_silabo: { is: { silabos: { is: visibleSyllabus } } } },
      select: { revisiones_silabo: { select: { revision_silabo_id: true, silabo_id: true } } },
    })
    return row ? { revisionId: row.revisiones_silabo.revision_silabo_id, syllabusId: row.revisiones_silabo.silabo_id } : null
  }
}
