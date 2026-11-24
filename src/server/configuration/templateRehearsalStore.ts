import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { TransactionRollbackError } from "drizzle-orm/errors"
import { db } from "@/db"
import { phpJsonDecode } from "./phpValues"
import type { RehearsalReads, RehearsalStore, RehearsedSyllabus } from "./templateRehearsal"
import { createTemplateStore, loadTemplate } from "./templateStore"

const TIMEOUT_STATES = ["57014", "55P03"]
const LOCK_TIMEOUT = "2s"
const STATEMENT_TIMEOUT = "20s"

type Executor = { execute(query: SQL): Promise<{ rows: unknown[] }> }

async function rows<T>(executor: Executor, query: SQL): Promise<T[]> {
  return (await executor.execute(query)).rows as T[]
}

function uuidList(ids: string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
}

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
      await executor.execute(sql`select * from plantilla_silabo where plantilla_id = ${templateId}::uuid limit 1 for update`)
    },
    currentTemplate: () => loadTemplate(executor),
    async syllabi(processId) {
      const found = await rows<{ id: string; state: string; subject_id: string; career: string | null }>(
        executor,
        sql`select silabos.silabo_id::text as id, silabos.estado_silabo as state, paralelos.asignatura_id::text as subject_id, carreras.nombre_carrera as career
          from silabos
          inner join paralelos on paralelos.paralelo_id = silabos.paralelo_id
          inner join convocatorias_carreras on convocatorias_carreras.convocatoria_carrera_id = silabos.convocatoria_carrera_id
          left join carreras on carreras.carrera_id = convocatorias_carreras.carrera_id
          where exists (select * from convocatorias_carreras convocatoria where silabos.convocatoria_carrera_id = convocatoria.convocatoria_carrera_id
              and convocatoria.convocatoria_universidad_id = ${processId}::uuid
              and convocatoria.estado_convocatoria_carrera in ('abierta', 'pausada')
              and exists (select * from convocatorias_universidad where convocatoria.convocatoria_universidad_id = convocatorias_universidad.convocatoria_universidad_id))
            and silabos.estado_silabo != 'sin_iniciar'
          order by silabos.silabo_id asc`,
      )
      return found.map((row): RehearsedSyllabus => ({ id: row.id, state: row.state, subjectId: row.subject_id, career: row.career }))
    },
    async syllabusValues(syllabusId) {
      const found = await rows<{ field_id: string; value: string | null }>(
        executor,
        sql`select definicion_campo_id::text as field_id, valor_campo::text as value from valores_campo where silabo_id = ${syllabusId}::uuid`,
      )
      return found.map((row) => ({ fieldId: row.field_id, value: phpJsonDecode(row.value) }))
    },
    async fieldKeys(fieldIds) {
      if (fieldIds.length === 0) return new Map()
      const found = await rows<{ id: string; key: string | null }>(
        executor,
        sql`select definiciones_campo.definicion_campo_id::text as id, campos_plantilla.clave_campo_plantilla as key
          from definiciones_campo left join campos_plantilla on campos_plantilla.campo_plantilla_id = definiciones_campo.campo_plantilla_id
          where definiciones_campo.definicion_campo_id in (${uuidList(fieldIds)})`,
      )
      return new Map(found.map((row) => [row.id, row.key ?? ""]))
    },
    store: createTemplateStore(executor),
  }
}

export async function pausedProcessOn(executor: Executor): Promise<string | null> {
  const [row] = await rows<{ id: string }>(
    executor,
    sql`select convocatoria_universidad_id::text as id from convocatorias_universidad where estado_convocatoria_universidad = 'pausado' limit 1`,
  )
  return row?.id ?? null
}

export function rehearsalSettings(): SQL {
  return sql`select set_config('lock_timeout', ${LOCK_TIMEOUT}, true), set_config('statement_timeout', ${STATEMENT_TIMEOUT}, true)`
}

export function createRehearsalStore(): RehearsalStore {
  return {
    pausedProcess: () => pausedProcessOn(db as unknown as Executor),
    async rehearse(work) {
      let outcome: { value: Awaited<ReturnType<typeof work>> } | null = null
      try {
        await db.transaction(async (tx) => {
          const executor = tx as unknown as Executor
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
