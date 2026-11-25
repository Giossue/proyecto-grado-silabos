import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { phpJsonEncode } from "../http/phpJson"
import { phpJsonDecode } from "./phpValues"
import type { DocumentSection, FieldRecord, StructureStore, StructureTx } from "./templateStructure"
import { loadTemplate } from "./templateStore"

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

function notIn(column: SQL, ids: string[]): SQL {
  return ids.length === 0 ? sql`1 = 1` : sql`${column} not in (${uuidList(ids)})`
}

function inList(column: SQL, ids: string[]): SQL {
  return ids.length === 0 ? sql`0 = 1` : sql`${column} in (${uuidList(ids)})`
}

async function exists(executor: Executor, query: SQL): Promise<boolean> {
  const [row] = await rows<{ found: boolean }>(executor, sql`select exists (${query}) as found`)
  return row?.found === true
}

export async function syncDocument(executor: Executor, templateId: string, sections: DocumentSection[]): Promise<void> {
  const sectionIds = sections.map((section) => section.id)
  const blockIds = sections.flatMap((section) => section.blocks.map((block) => block.id))
  const retired = (
    await rows<{ id: string }>(
      executor,
      sql`select campo_plantilla_id::text as id from campos_plantilla where plantilla_id = ${templateId}::uuid and ${notIn(sql`campo_plantilla_id`, blockIds)}`,
    )
  ).map((row) => row.id)
  await executor.execute(sql`update definiciones_campo set vigente_en_plantilla = false where ${inList(sql`campo_plantilla_id`, retired)}`)
  await executor.execute(sql`update campos_plantilla set vigente_en_plantilla = false where ${inList(sql`campo_plantilla_id`, retired)}`)
  await executor.execute(
    sql`update secciones_plantilla set vigente_en_plantilla = false where plantilla_id = ${templateId}::uuid and ${notIn(sql`seccion_plantilla_id`, sectionIds)}`,
  )
  await executor.execute(sql`delete from definiciones_campo where plantilla_id = ${templateId}::uuid and vigente_en_plantilla = false
    and not exists (select 1 from valores_campo where valores_campo.definicion_campo_id = definiciones_campo.definicion_campo_id)`)
  await executor.execute(sql`delete from campos_plantilla where plantilla_id = ${templateId}::uuid and vigente_en_plantilla = false
    and not exists (select 1 from definiciones_campo where definiciones_campo.campo_plantilla_id = campos_plantilla.campo_plantilla_id)`)
  await executor.execute(sql`delete from secciones_plantilla where plantilla_id = ${templateId}::uuid and vigente_en_plantilla = false
    and not exists (select 1 from campos_plantilla where campos_plantilla.seccion_plantilla_id = secciones_plantilla.seccion_plantilla_id)`)
  for (const [sectionIndex, section] of sections.entries()) {
    const position = Number.isFinite(section.position) ? Math.trunc(section.position) : sectionIndex + 1
    const orientation = section.orientation ?? "portrait"
    if (await exists(executor, sql`select * from secciones_plantilla where seccion_plantilla_id = ${section.id}::uuid`)) {
      await executor.execute(sql`update secciones_plantilla set plantilla_id = ${templateId}::uuid, clave_seccion_plantilla = ${section.key},
          titulo_seccion_plantilla = ${section.title ?? ""}, orientacion_seccion_plantilla = ${orientation}, posicion_seccion_plantilla = ${position}
        where seccion_plantilla_id = ${section.id}::uuid`)
    } else {
      await executor.execute(sql`insert into secciones_plantilla (seccion_plantilla_id, plantilla_id, clave_seccion_plantilla, titulo_seccion_plantilla,
          orientacion_seccion_plantilla, posicion_seccion_plantilla)
        values (${section.id}::uuid, ${templateId}::uuid, ${section.key}, ${section.title ?? ""}, ${orientation}, ${position})`)
    }
    for (const [blockIndex, block] of section.blocks.entries()) {
      const blockPosition = Number.isFinite(block.position) ? Math.trunc(block.position) : blockIndex + 1
      if (await exists(executor, sql`select * from campos_plantilla where campo_plantilla_id = ${block.id}::uuid`)) {
        await executor.execute(sql`update campos_plantilla set seccion_plantilla_id = ${section.id}::uuid, plantilla_id = ${templateId}::uuid,
            clave_campo_plantilla = ${block.key}, titulo_campo_plantilla = ${block.title ?? ""}, posicion_campo_plantilla = ${blockPosition}
          where campo_plantilla_id = ${block.id}::uuid`)
      } else {
        await executor.execute(sql`insert into campos_plantilla (campo_plantilla_id, seccion_plantilla_id, plantilla_id, clave_campo_plantilla,
            titulo_campo_plantilla, posicion_campo_plantilla)
          values (${block.id}::uuid, ${section.id}::uuid, ${templateId}::uuid, ${block.key}, ${block.title ?? ""}, ${blockPosition})`)
      }
    }
  }
}

export function structureTx(executor: Executor): StructureTx {
  return {
    async lockTemplate(templateId) {
      const [row] = await rows<{ id: string }>(
        executor,
        sql`select plantilla_id::text as id from plantilla_silabo where plantilla_id = ${templateId}::uuid limit 1 for update`,
      )
      return row ? loadTemplate(executor) : null
    },
    reload: () => loadTemplate(executor),
    syncDocument: (templateId, sections) => syncDocument(executor, templateId, sections),
    async insertField(field) {
      await executor.execute(sql`insert into definiciones_campo (plantilla_id, campo_plantilla_id, quien_llena_definicion_campo, contenido_definicion_campo, definicion_campo_id)
        values (${field.templateId}::uuid, ${field.blockId}::uuid, ${field.responsible}, ${phpJsonEncode(field.content)}::jsonb, ${field.id}::uuid)`)
    },
    async updateField(id, changes) {
      const assignments: SQL[] = []
      if (changes.responsible !== undefined) assignments.push(sql`quien_llena_definicion_campo = ${changes.responsible}`)
      if (changes.content !== undefined) assignments.push(sql`contenido_definicion_campo = ${phpJsonEncode(changes.content)}::jsonb`)
      if (assignments.length === 0) return
      await executor.execute(sql`update definiciones_campo set ${sql.join(assignments, sql`, `)} where definicion_campo_id = ${id}::uuid`)
    },
  }
}

export function structureStoreOn(executor: Executor, transaction: <T>(work: (tx: StructureTx) => Promise<T>) => Promise<T>): StructureStore {
  return {
    async templateLocked() {
      const [row] = await rows<{ id: string }>(
        executor,
        sql`select convocatoria_universidad_id::text as id from convocatorias_universidad where estado_convocatoria_universidad = 'abierto' limit 1`,
      )
      return row !== undefined
    },
    async field(id) {
      const [row] = await rows<{ id: string; template_id: string; block_id: string; responsible: string; content: string | null; key: string | null; label: string | null }>(
        executor,
        sql`select definiciones_campo.definicion_campo_id::text as id, definiciones_campo.plantilla_id::text as template_id,
            definiciones_campo.campo_plantilla_id::text as block_id, definiciones_campo.quien_llena_definicion_campo as responsible,
            definiciones_campo.contenido_definicion_campo::text as content, campos_plantilla.clave_campo_plantilla as key, campos_plantilla.titulo_campo_plantilla as label
          from definiciones_campo left join campos_plantilla on campos_plantilla.campo_plantilla_id = definiciones_campo.campo_plantilla_id
          where definiciones_campo.definicion_campo_id = ${id}::uuid limit 1`,
      )
      if (!row) return null
      const record: FieldRecord = {
        id: row.id,
        templateId: row.template_id,
        blockId: row.block_id,
        responsible: row.responsible,
        content: phpJsonDecode(row.content),
        key: row.key ?? "",
        label: row.label ?? "",
      }
      return record
    },
    async liveKeyTaken(templateId, key) {
      const [row] = await rows<{ aggregate: string }>(
        executor,
        sql`select count(*) as aggregate from campos_plantilla where clave_campo_plantilla = ${key} and plantilla_id = ${templateId}::uuid and vigente_en_plantilla = true`,
      )
      return Number(row?.aggregate ?? 0) > 0
    },
    async liveFieldBlocks(templateId, fieldIds) {
      if (fieldIds.length === 0) return new Map()
      const found = await rows<{ id: string; block_id: string }>(
        executor,
        sql`select definicion_campo_id::text as id, campo_plantilla_id::text as block_id from definiciones_campo
          where plantilla_id = ${templateId}::uuid and definicion_campo_id in (${uuidList(fieldIds)}) and vigente_en_plantilla = true`,
      )
      return new Map(found.map((row) => [row.id, row.block_id]))
    },
    transaction,
  }
}

export function createStructureStore(): StructureStore {
  return structureStoreOn(db as unknown as Executor, (work) => db.transaction((tx) => work(structureTx(tx as unknown as Executor))))
}
