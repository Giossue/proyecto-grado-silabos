import { Inject, Injectable } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import { phpJsonDecode } from "../../server/configuration/phpValues"
import type { RehearsalReads, RehearsalStore } from "../../server/configuration/templateRehearsal"
import { type Db, TRANSACTION_OPTIONS } from "./template-db"
import { loadTemplateFrom, templateStoreOn } from "./template.repository"

const TIMEOUT_STATES = ["57014", "55P03"]
const LOCK_TIMEOUT = "2s"
const STATEMENT_TIMEOUT = "20s"
const SQLSTATE = /^[0-9A-Z]{5}$/
const PRISMA_CODE = /^P\d{4}$/

class RolledBack extends Error {
  constructor(readonly value: unknown) {
    super("rolled back")
  }
}

export function prismaSqlState(error: unknown): string | null {
  const pending: unknown[] = [error]
  for (let visited = 0; visited < 16 && pending.length > 0; visited++) {
    const current = pending.shift()
    if (typeof current !== "object" || current === null) continue
    const { originalCode, code } = current as { originalCode?: unknown; code?: unknown }
    if (typeof originalCode === "string" && SQLSTATE.test(originalCode)) return originalCode
    if (typeof code === "string" && SQLSTATE.test(code) && !PRISMA_CODE.test(code)) return code
    for (const key of ["cause", "meta", "driverAdapterError"]) pending.push((current as Record<string, unknown>)[key])
  }
  return null
}

export function rehearsalReadsOn(db: Db): RehearsalReads {
  return {
    async lockTemplate(templateId) {
      await db.$queryRaw`select plantilla_id::text as id from plantilla_silabo where plantilla_id = ${templateId}::uuid limit 1 for update`
    },
    currentTemplate: () => loadTemplateFrom(db),
    async syllabi(processId) {
      const found = await db.silabos.findMany({
        where: {
          estado_silabo: { not: "sin_iniciar" },
          convocatorias_carreras: { convocatoria_universidad_id: processId, estado_convocatoria_carrera: { in: ["abierta", "pausada"] } },
        },
        select: { silabo_id: true, estado_silabo: true, paralelos: { select: { asignatura_id: true } }, convocatorias_carreras: { select: { carreras: { select: { nombre_carrera: true } } } } },
        orderBy: { silabo_id: "asc" },
      })
      return found.map((row) => ({ id: row.silabo_id, state: row.estado_silabo, subjectId: row.paralelos.asignatura_id, career: row.convocatorias_carreras.carreras.nombre_carrera }))
    },
    async syllabusValues(syllabusId) {
      const found = await db.$queryRaw<{ fieldId: string; value: string | null }[]>`
        select definicion_campo_id::text as "fieldId", valor_campo::text as value from valores_campo where silabo_id = ${syllabusId}::uuid`
      return found.map((row) => ({ fieldId: row.fieldId, value: phpJsonDecode(row.value) }))
    },
    async fieldKeys(fieldIds) {
      if (fieldIds.length === 0) return new Map()
      const found = await db.definiciones_campo.findMany({
        where: { definicion_campo_id: { in: fieldIds } },
        select: { definicion_campo_id: true, campos_plantilla_definiciones_campo_campo_plantilla_idTocampos_plantilla: { select: { clave_campo_plantilla: true } } },
      })
      return new Map(found.map((row) => [row.definicion_campo_id, row.campos_plantilla_definiciones_campo_campo_plantilla_idTocampos_plantilla.clave_campo_plantilla]))
    },
    store: templateStoreOn(db),
  }
}

@Injectable()
export class TemplateRehearsalRepository implements RehearsalStore {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async pausedProcess(): Promise<string | null> {
    const row = await this.prisma.convocatorias_universidad.findFirst({ where: { estado_convocatoria_universidad: "pausado" }, select: { convocatoria_universidad_id: true } })
    return row?.convocatoria_universidad_id ?? null
  }

  async rehearse<T>(work: (reads: RehearsalReads) => Promise<T>): Promise<T | null> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`select set_config('lock_timeout', ${LOCK_TIMEOUT}, true) as lock_timeout, set_config('statement_timeout', ${STATEMENT_TIMEOUT}, true) as statement_timeout`
        throw new RolledBack(await work(rehearsalReadsOn(tx)))
      }, TRANSACTION_OPTIONS)
    } catch (error) {
      if (error instanceof RolledBack) return error.value as T
      if (TIMEOUT_STATES.includes(prismaSqlState(error) ?? "")) return null
      throw error
    }
    return null
  }
}
