import { Prisma } from "../../generated/prisma/client"
import type { Db } from "../../prisma/db"
import { fromEpoch } from "../../prisma/sql"
import { uuid7 } from "../http/uuid7"
import { rowsOf } from "../syllabus/teacherSyllabusQueries"
import type { SignatureTx } from "./signDecision"

export function signatureTxOn(executor: Db): SignatureTx {
  return {
    async signed(syllabusId, role) {
      const [row] = await rowsOf<{ id: string }>(
        executor,
        Prisma.sql`select "firma_silabo_id"::text as id from "firmas_silabo" where ("firmas_silabo"."silabo_id" = ${syllabusId}::uuid and "firmas_silabo"."firmado_como" = ${role}) limit 1`,
      )
      return row !== undefined
    },
    async insertSignature(row) {
      const id = uuid7()
      await executor.$executeRaw`insert into "firmas_silabo" ("firma_silabo_id", "silabo_id", "revision_silabo_id", "firmado_como", "usuario_id", "declaracion_firmada", "firma_cms",
          "nombre_en_certificado", "numero_certificado", "entidad_emisora", "certificado_valido_hasta", "firmado_en")
        values (${id}::uuid, ${row.syllabusId}::uuid, ${row.revisionId}::uuid, ${row.role}, ${row.userId}::uuid, ${row.statement}, ${row.cms},
          ${row.holder}, ${row.serial}, ${row.issuer}, ${fromEpoch(row.validTo)}, ${fromEpoch(row.signedAt)})`
      return id
    },
  }
}
