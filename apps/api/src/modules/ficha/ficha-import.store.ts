import { Inject, Injectable } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import { phpJsonDecode } from "../../server/configuration/phpValues"
import type { TemplateStore } from "../../server/configuration/templateStore"
import type { CurrentValue, FichaImportStore } from "../../server/ficha/fichaImports"
import type { FichaSubject } from "../../server/ficha/fichaWorkbook"
import { uuidList } from "../academic/repositories/scheduled-subjects.repository"

export class FichaImportPrismaStore implements FichaImportStore {
  constructor(
    private readonly prisma: PrismaService,
    readonly store: TemplateStore,
    readonly careerLocked: (careerId: string) => Promise<boolean>,
  ) {}

  async activeCareer(careerId: string): Promise<{ id: string; name: string } | null> {
    const row = await this.prisma.carreras.findFirst({ where: { carrera_activa: true, carrera_id: careerId }, select: { carrera_id: true, nombre_carrera: true } })
    return row ? { id: row.carrera_id, name: row.nombre_carrera } : null
  }

  async subjects(careerId: string): Promise<FichaSubject[]> {
    const rows = await this.prisma.asignaturas.findMany({
      where: { carrera_id: careerId, asignatura_activa: true, genera_silabo_asignatura: true },
      select: { asignatura_id: true, codigo_asignatura: true, nombre_asignatura: true, ciclo_asignatura: true },
      orderBy: [{ ciclo_asignatura: "asc" }, { orden_asignatura_en_ciclo: "asc" }, { codigo_asignatura: "asc" }, { asignatura_id: "asc" }],
    })
    return rows.map((row) => ({ id: row.asignatura_id, code: row.codigo_asignatura, name: row.nombre_asignatura, cycle: row.ciclo_asignatura }))
  }

  async careerActive(careerId: string): Promise<boolean> {
    const row = await this.prisma.carreras.findFirst({ where: { carrera_id: careerId }, select: { carrera_activa: true } })
    return row?.carrera_activa === true
  }

  async currentValues(subjectIds: string[], fieldIds: string[]): Promise<CurrentValue[]> {
    if (subjectIds.length === 0 || fieldIds.length === 0) return []
    const rows = await this.prisma.$queryRaw<{ subject_id: string | null; field_id: string; value: string | null }[]>`select asignatura_id::text as subject_id,
        definicion_campo_id::text as field_id, valor_campo::text as value
      from valores_campo where asignatura_id in (${uuidList(subjectIds)}) and definicion_campo_id in (${uuidList(fieldIds)})`
    return rows.map((row) => ({ subjectId: row.subject_id ?? "", fieldId: row.field_id, value: phpJsonDecode(row.value) }))
  }
}

@Injectable()
export class FichaImportStoreFactory {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  create(drizzle: Pick<FichaImportStore, "store" | "careerLocked">): FichaImportPrismaStore {
    return new FichaImportPrismaStore(this.prisma, drizzle.store, drizzle.careerLocked)
  }
}

