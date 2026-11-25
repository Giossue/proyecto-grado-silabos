import { Inject, Injectable } from "@nestjs/common"
import { PrismaService } from "../../../prisma/prisma.service"
import type { StructureImportStore } from "../../../server/academic/structureImports"

@Injectable()
export class StructureImportPrismaStore implements StructureImportStore {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async activeFaculties(): Promise<{ id: string; name: string }[]> {
    const rows = await this.prisma.facultades.findMany({ where: { facultad_activa: true }, select: { facultad_id: true, nombre_facultad: true }, orderBy: { nombre_facultad: "asc" } })
    return rows.map((row) => ({ id: row.facultad_id, name: String(row.nombre_facultad) }))
  }

  async facultiesForImport(): Promise<{ id: string; name: string }[]> {
    const rows = await this.prisma.facultades.findMany({ where: { facultad_activa: true }, select: { facultad_id: true, nombre_facultad: true } })
    return rows.map((row) => ({ id: row.facultad_id, name: String(row.nombre_facultad) }))
  }

  async careerCodes(): Promise<string[]> {
    const rows = await this.prisma.carreras.findMany({ select: { codigo_carrera: true } })
    return rows.map((row) => String(row.codigo_carrera))
  }

  async careerActive(careerId: string): Promise<boolean> {
    return (await this.prisma.carreras.findFirst({ where: { carrera_id: careerId, carrera_activa: true }, select: { carrera_id: true } })) !== null
  }

  async career(careerId: string): Promise<{ id: string; cycleCount: number } | null> {
    const row = await this.prisma.carreras.findFirst({ where: { carrera_id: careerId }, select: { carrera_id: true, numero_ciclos: true } })
    return row ? { id: row.carrera_id, cycleCount: row.numero_ciclos } : null
  }

  async careerSubjects(careerId: string): Promise<{ id: string; code: string; cycle: number | null }[]> {
    const rows = await this.prisma.asignaturas.findMany({ where: { carrera_id: careerId }, select: { asignatura_id: true, codigo_asignatura: true, ciclo_asignatura: true } })
    return rows.map((row) => ({ id: row.asignatura_id, code: String(row.codigo_asignatura), cycle: row.ciclo_asignatura }))
  }
}
