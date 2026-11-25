import "server-only"
import { sql } from "drizzle-orm"
import { uuid7 } from "../http/uuid7"
import { rowsOf, type Executor } from "../syllabus/teacherSyllabusQueries"
import type { SignatureTx } from "./signDecision"

export function signatureTxOn(executor: Executor): SignatureTx {
  return {
    async signed(syllabusId, role) {
      const [row] = await rowsOf<{ found: boolean }>(
        executor,
        sql`select exists (select 1 from firmas_silabo where silabo_id = ${syllabusId}::uuid and firmado_como = ${role}) as found`,
      )
      return row?.found === true
    },
    async insertSignature(row) {
      const id = uuid7()
      await executor.execute(sql`insert into firmas_silabo (firma_silabo_id, silabo_id, revision_silabo_id, firmado_como, usuario_id, declaracion_firmada,
          firma_cms, nombre_en_certificado, numero_certificado, entidad_emisora, certificado_valido_hasta, firmado_en)
        values (${id}::uuid, ${row.syllabusId}::uuid, ${row.revisionId}::uuid, ${row.role}, ${row.userId}::uuid, ${row.statement}, ${row.cms},
          ${row.holder}, ${row.serial}, ${row.issuer}, to_timestamp(${row.validTo}), to_timestamp(${row.signedAt}))`)
      return id
    },
  }
}
