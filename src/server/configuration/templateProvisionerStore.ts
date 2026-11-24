import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { phpJsonEncode } from "../laravel/phpJson"
import { insertAuditEvent } from "../operations/recordAuditEvent"
import { phpShape, type PhpRecord } from "./phpValues"
import { defaultProvisionDeps, type ProvisionDeps, type ProvisionStore, type ProvisionTx } from "./templateProvisioner"
import { structureStoreOn, structureTx } from "./templateStructureStore"

type Executor = { execute(query: SQL): Promise<{ rows: unknown[] }> }

async function rows<T>(executor: Executor, query: SQL): Promise<T[]> {
  return (await executor.execute(query)).rows as T[]
}

export function provisionTx(executor: Executor): ProvisionTx {
  const structure = structureTx(executor)
  return {
    async anyTemplate() {
      const [row] = await rows<{ exists: boolean }>(executor, sql`select exists(select * from plantilla_silabo for update) as exists`)
      return row?.exists === true
    },
    lockTemplate: (templateId) => structure.lockTemplate(templateId),
    async insertTemplate(templateId, definition) {
      await executor.execute(sql`insert into plantilla_silabo (definicion_plantilla, plantilla_id) values (${phpJsonEncode(phpShape(definition))}::jsonb, ${templateId}::uuid)`)
    },
    async hasStructure(templateId) {
      const [row] = await rows<{ found: boolean }>(
        executor,
        sql`select exists (select 1 from secciones_plantilla where plantilla_id = ${templateId}::uuid and vigente_en_plantilla = true)
            and exists (select 1 from campos_plantilla inner join secciones_plantilla on secciones_plantilla.seccion_plantilla_id = campos_plantilla.seccion_plantilla_id
              where campos_plantilla.plantilla_id = ${templateId}::uuid and campos_plantilla.vigente_en_plantilla = true and secciones_plantilla.vigente_en_plantilla = true)
            and exists (select 1 from definiciones_campo where plantilla_id = ${templateId}::uuid and vigente_en_plantilla = true) as found`,
      )
      return row?.found === true
    },
    syncDocument: (templateId, sections) => structure.syncDocument(templateId, sections),
    async suffixRetiredSections(templateId) {
      await executor.execute(sql`update secciones_plantilla set clave_seccion_plantilla = clave_seccion_plantilla || '-' || substr(seccion_plantilla_id::text, 1, 8)
        where plantilla_id = ${templateId}::uuid and vigente_en_plantilla = false
          and right(clave_seccion_plantilla, 9) <> '-' || substr(seccion_plantilla_id::text, 1, 8)`)
    },
    insertField: (field) => structure.insertField({ ...field, content: phpShape(field.content) as PhpRecord }),
    async saveDefinition(templateId, definition) {
      await executor.execute(sql`update plantilla_silabo set definicion_plantilla = ${phpJsonEncode(phpShape(definition))}::jsonb where plantilla_id = ${templateId}::uuid`)
    },
    async coordinationFields(templateId) {
      const found = await rows<{ key: string; id: string }>(
        executor,
        sql`select campos_plantilla.clave_campo_plantilla as key, definiciones_campo.definicion_campo_id::text as id from definiciones_campo
          inner join campos_plantilla on campos_plantilla.campo_plantilla_id = definiciones_campo.campo_plantilla_id
          where definiciones_campo.plantilla_id = ${templateId}::uuid and definiciones_campo.vigente_en_plantilla = true
            and campos_plantilla.vigente_en_plantilla = true and definiciones_campo.quien_llena_definicion_campo != 'institucional'`,
      )
      return new Map(found.map((row) => [row.key, row.id]))
    },
    async moveSubjectValues(from, to) {
      await executor.execute(sql`update valores_campo set definicion_campo_id = ${to}::uuid where definicion_campo_id = ${from}::uuid and asignatura_id is not null`)
    },
  }
}

export function provisionStoreOn(executor: Executor, transaction: <T>(work: (executor: Executor) => Promise<T>) => Promise<T>): ProvisionStore {
  const structure = structureStoreOn(executor, async () => {
    throw new Error("unused")
  })
  return {
    templateLocked: () => structure.templateLocked(),
    transaction: (work) => transaction((inner) => work(provisionTx(inner))),
    recordAudit: async (event) => void (await insertAuditEvent(executor, event)),
  }
}

export function createProvisionDeps(): ProvisionDeps {
  return defaultProvisionDeps(provisionStoreOn(db as unknown as Executor, (work) => db.transaction((tx) => work(tx as unknown as Executor))))
}
