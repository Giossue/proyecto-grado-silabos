import "server-only"
import { and, eq } from "drizzle-orm"
import { fromEpoch } from "@/db/expressions"
import { firmasSilabo } from "@/db/schema"
import { uuid7 } from "../http/uuid7"
import type { Executor } from "../syllabus/teacherSyllabusQueries"
import type { SignatureTx } from "./signDecision"

export function signatureTxOn(executor: Executor): SignatureTx {
  return {
    async signed(syllabusId, role) {
      const [row] = await executor
        .select({ id: firmasSilabo.firmaSilaboId })
        .from(firmasSilabo)
        .where(and(eq(firmasSilabo.silaboId, syllabusId), eq(firmasSilabo.firmadoComo, role)))
        .limit(1)
      return row !== undefined
    },
    async insertSignature(row) {
      const id = uuid7()
      await executor.insert(firmasSilabo).values({
        firmaSilaboId: id,
        silaboId: row.syllabusId,
        revisionSilaboId: row.revisionId,
        firmadoComo: row.role,
        usuarioId: row.userId,
        declaracionFirmada: row.statement,
        firmaCms: row.cms,
        nombreEnCertificado: row.holder,
        numeroCertificado: row.serial,
        entidadEmisora: row.issuer,
        certificadoValidoHasta: fromEpoch(row.validTo),
        firmadoEn: fromEpoch(row.signedAt),
      })
      return id
    },
  }
}
