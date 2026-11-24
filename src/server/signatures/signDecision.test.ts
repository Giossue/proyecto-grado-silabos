// @vitest-environment node
import { describe, expect, it } from "vitest"
import golden from "./__fixtures__/laravel-signatures-golden.json"
import { SignatureRejected, type SignatureSettings } from "./cmsVerifier"
import { decisionSignatureFrom } from "./decisionSignature"
import { signDecision, type SignatureRow, type SignatureTx } from "./signDecision"

const SYLLABUS = "01a2094b-56da-719b-a847-c1c9a1aa0584"
const REVISION = "70000000-0000-4000-8000-000000000001"
const FINGERPRINT = "ab".repeat(32)
const VALID = golden.cases[0].cms
const settings: SignatureSettings & { requireHolderMatch: boolean } = { trustedBundle: null, production: false, now: () => golden.now, requireHolderMatch: true }

function fakeTx(signed: string[] = []) {
  const rows: SignatureRow[] = []
  const tx: SignatureTx = {
    signed: async (_syllabusId, role) => signed.includes(role),
    insertSignature: async (row) => {
      rows.push(row)
      return "f0000000-0000-4000-8000-000000000001"
    },
  }
  return { tx, rows }
}

const revision = { id: REVISION, syllabusId: SYLLABUS, number: 2, fingerprint: FINGERPRINT }
const actor = { id: "a0000000-0000-4000-8000-000000000001", name: "Ana María Pérez López" }

async function rejection(work: () => Promise<unknown>): Promise<string> {
  try {
    await work()
  } catch (error) {
    if (error instanceof SignatureRejected) return error.message
    throw error
  }
  return "accepted"
}

describe("DecisionSignature::from", () => {
  it("accepts no signature and keeps a well formed one", () => {
    expect(decisionSignatureFrom(null)).toBeNull()
    expect(decisionSignatureFrom(undefined)).toBeNull()
    expect(decisionSignatureFrom({ statement: "s", cms: "c" })).toEqual({ statement: "s", cms: "c" })
  })

  it.each([
    [{ statement: "s" }],
    [{ statement: "", cms: "c" }],
    [{ statement: "s", cms: 5 }],
    [{ statement: "x".repeat(501), cms: "c" }],
    [{ statement: "s", cms: "c".repeat(200001) }],
    [[]],
    ["texto"],
  ])("rejects %j with the Laravel message", async (input) => {
    expect(await rejection(async () => decisionSignatureFrom(input))).toBe("La firma no es válida.")
  })

  it("counts bytes, not characters, like strlen", async () => {
    expect(await rejection(async () => decisionSignatureFrom({ statement: "á".repeat(251), cms: "c" }))).toBe("La firma no es válida.")
    expect(decisionSignatureFrom({ statement: "á".repeat(250), cms: "c" })).not.toBeNull()
  })
})

describe("SignSyllabusDecision", () => {
  it("does nothing when the role already signed the syllabus", async () => {
    const { tx, rows } = fakeTx(["docente"])
    expect(await signDecision(tx, { revision, role: "docente", signature: null, actor, now: 1_800_000_000 }, settings)).toBeNull()
    expect(rows).toEqual([])
  })

  it("asks for a signature when it is missing and checks the statement before the CMS", async () => {
    const { tx } = fakeTx()
    expect(await rejection(() => signDecision(tx, { revision, role: "docente", signature: null, actor, now: 1 }, settings))).toBe("Firme con su firma electrónica.")
    expect(await rejection(() => signDecision(tx, { revision, role: "coordinacion", signature: { statement: golden.statement, cms: VALID }, actor, now: 1 }, settings))).toBe(
      "La declaración firmada no corresponde. Vuelva a firmar.",
    )
  })

  it("rejects a certificate of somebody else when the holder must match", async () => {
    const { tx, rows } = fakeTx()
    const other = { ...actor, name: "María Luisa Gómez Torres" }
    expect(await rejection(() => signDecision(tx, { revision, role: "docente", signature: { statement: golden.statement, cms: VALID }, actor: other, now: 1 }, settings))).toBe(
      "El certificado es de «ANA MARÍA PÉREZ LÓPEZ», no de María Luisa Gómez Torres.",
    )
    expect(rows).toEqual([])
    const { tx: relaxed, rows: stored } = fakeTx()
    await signDecision(relaxed, { revision, role: "docente", signature: { statement: golden.statement, cms: VALID }, actor: other, now: 1 }, { ...settings, requireHolderMatch: false })
    expect(stored).toHaveLength(1)
  })

  it("stores the verified signature without whitespace", async () => {
    const { tx, rows } = fakeTx()
    const wrapped = `${VALID.slice(0, 40)}\n ${VALID.slice(40)}`
    const id = await signDecision(tx, { revision, role: "docente", signature: { statement: golden.statement, cms: wrapped }, actor, now: 1_800_000_123 }, settings)
    expect(id).toBe("f0000000-0000-4000-8000-000000000001")
    expect(rows).toEqual([
      {
        syllabusId: SYLLABUS,
        revisionId: REVISION,
        role: "docente",
        userId: actor.id,
        statement: golden.statement,
        cms: VALID,
        holder: "ANA MARÍA PÉREZ LÓPEZ",
        serial: "8F1234",
        issuer: "C=EC, O=Universidad de prueba, OU=Firmas, CN=AUTORIDAD DE PRUEBA T12A",
        validTo: Date.UTC(2036, 0, 1) / 1000,
        signedAt: 1_800_000_123,
      },
    ])
  })
})
