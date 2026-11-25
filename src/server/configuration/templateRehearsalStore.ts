import "server-only"
import { and, asc, eq, exists, inArray, ne, sql, type SQL } from "drizzle-orm"
import { TransactionRollbackError } from "drizzle-orm/errors"
import { alias } from "drizzle-orm/pg-core"
import { db, type Executor } from "@/db"
import { jsonText } from "@/db/expressions"
import { camposPlantilla, carreras, convocatoriasCarreras, convocatoriasUniversidad, definicionesCampo, paralelos, plantillaSilabo, silabos, valoresCampo } from "@/db/schema"
import { phpJsonDecode } from "./phpValues"
import type { RehearsalReads, RehearsalStore } from "./templateRehearsal"
import { createTemplateStore, loadTemplate } from "./templateStore"

const TIMEOUT_STATES = ["57014", "55P03"]
const LOCK_TIMEOUT = "2s"
const STATEMENT_TIMEOUT = "20s"
const convocatoria = alias(convocatoriasCarreras, "convocatoria")

export function sqlState(error: unknown): string | null {
  let current: unknown = error
  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth++) {
    const code = (current as { code?: unknown }).code
    if (typeof code === "string") return code
    current = (current as { cause?: unknown }).cause
  }
  return null
}

export function rehearsalReads(executor: Executor): RehearsalReads {
  return {
    async lockTemplate(templateId) {
      await executor.select().from(plantillaSilabo).where(eq(plantillaSilabo.plantillaId, templateId)).limit(1).for("update")
    },
    currentTemplate: () => loadTemplate(executor),
    async syllabi(processId) {
      return executor
        .select({ id: silabos.silaboId, state: silabos.estadoSilabo, subjectId: paralelos.asignaturaId, career: carreras.nombreCarrera })
        .from(silabos)
        .innerJoin(paralelos, eq(paralelos.paraleloId, silabos.paraleloId))
        .innerJoin(convocatoriasCarreras, eq(convocatoriasCarreras.convocatoriaCarreraId, silabos.convocatoriaCarreraId))
        .leftJoin(carreras, eq(carreras.carreraId, convocatoriasCarreras.carreraId))
        .where(
          and(
            exists(
              executor
                .select({ id: convocatoria.convocatoriaCarreraId })
                .from(convocatoria)
                .where(
                  and(
                    eq(silabos.convocatoriaCarreraId, convocatoria.convocatoriaCarreraId),
                    eq(convocatoria.convocatoriaUniversidadId, processId),
                    inArray(convocatoria.estadoConvocatoriaCarrera, ["abierta", "pausada"]),
                    exists(
                      executor
                        .select({ id: convocatoriasUniversidad.convocatoriaUniversidadId })
                        .from(convocatoriasUniversidad)
                        .where(eq(convocatoria.convocatoriaUniversidadId, convocatoriasUniversidad.convocatoriaUniversidadId)),
                    ),
                  ),
                ),
            ),
            ne(silabos.estadoSilabo, "sin_iniciar"),
          ),
        )
        .orderBy(asc(silabos.silaboId))
    },
    async syllabusValues(syllabusId) {
      const found = await executor
        .select({ fieldId: valoresCampo.definicionCampoId, value: jsonText(valoresCampo.valorCampo) })
        .from(valoresCampo)
        .where(eq(valoresCampo.silaboId, syllabusId))
      return found.map((row) => ({ fieldId: row.fieldId, value: phpJsonDecode(row.value) }))
    },
    async fieldKeys(fieldIds) {
      if (fieldIds.length === 0) return new Map()
      const found = await executor
        .select({ id: definicionesCampo.definicionCampoId, key: camposPlantilla.claveCampoPlantilla })
        .from(definicionesCampo)
        .leftJoin(camposPlantilla, eq(camposPlantilla.campoPlantillaId, definicionesCampo.campoPlantillaId))
        .where(inArray(definicionesCampo.definicionCampoId, fieldIds))
      return new Map(found.map((row) => [row.id, row.key ?? ""]))
    },
    store: createTemplateStore(executor),
  }
}

export async function pausedProcessOn(executor: Executor): Promise<string | null> {
  const [row] = await executor
    .select({ id: convocatoriasUniversidad.convocatoriaUniversidadId })
    .from(convocatoriasUniversidad)
    .where(eq(convocatoriasUniversidad.estadoConvocatoriaUniversidad, "pausado"))
    .limit(1)
  return row?.id ?? null
}

export function rehearsalSettings(): SQL {
  return sql`select set_config('lock_timeout', ${LOCK_TIMEOUT}, true), set_config('statement_timeout', ${STATEMENT_TIMEOUT}, true)`
}

export function createRehearsalStore(): RehearsalStore {
  return {
    pausedProcess: () => pausedProcessOn(db),
    async rehearse(work) {
      let outcome: { value: Awaited<ReturnType<typeof work>> } | null = null
      try {
        await db.transaction(async (tx) => {
          const executor: Executor = tx
          await executor.execute(rehearsalSettings())
          outcome = { value: await work(rehearsalReads(executor)) }
          tx.rollback()
        })
      } catch (error) {
        if (error instanceof TransactionRollbackError && outcome !== null) return (outcome as { value: Awaited<ReturnType<typeof work>> }).value
        if (TIMEOUT_STATES.includes(sqlState(error) ?? "")) return null
        throw error
      }
      return null
    },
  }
}
