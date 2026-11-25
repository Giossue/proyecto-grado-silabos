import { Inject, Injectable } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import type { LogoStore, StoredFaculty } from "../../server/configuration/institutionalLogos"

@Injectable()
export class LogosRepository implements LogoStore {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async faculty(id: string): Promise<StoredFaculty | null> {
    const row = await this.prisma.facultades.findUnique({
      where: { facultad_id: id },
      select: { facultad_id: true, archivos: { select: { disco: true, ruta_archivo: true, categoria: true } } },
    })
    if (!row) return null
    return { id: row.facultad_id, logo: row.archivos ? { disk: row.archivos.disco, path: row.archivos.ruta_archivo, classification: row.archivos.categoria } : null }
  }
}
