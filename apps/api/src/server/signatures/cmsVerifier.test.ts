// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import golden from "./__fixtures__/laravel-signatures-golden.json"
import { SignatureRejected, verifyCmsSignature, type SignatureSettings } from "./cmsVerifier"
import { holderMatches } from "./holderMatcher"

let root: string
const bundles: Record<string, string | null> = { none: null }

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "silabos-signatures-"))
  for (const [label, pem] of Object.entries(golden.authorities)) {
    bundles[label] = path.join(root, `${label}.pem`)
    await writeFile(bundles[label], pem)
  }
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

async function outcome(content: string, cms: string, settings: SignatureSettings) {
  try {
    const certificate = await verifyCmsSignature(content, cms, settings)
    return { holder: certificate.holder, serial: certificate.serial, issuer: certificate.issuer, valid_to: new Date(certificate.validTo * 1000).toISOString().replace(".000Z", "+00:00") }
  } catch (error) {
    if (error instanceof SignatureRejected) return { error: error.message }
    throw error
  }
}

const cases = golden.cases.flatMap((item) => Object.entries(item.outcomes).map(([bundle, expected]) => [`${item.name} (${bundle})`, item, bundle, expected] as const))

describe("CmsSignatureVerifier", () => {
  it.each(cases)("%s gives the same outcome as Laravel", async (_name, item, bundle, expected) => {
    const settings: SignatureSettings = { trustedBundle: bundles[bundle], production: false, now: () => golden.now }
    expect(await outcome(item.content, item.cms, settings)).toEqual(expected)
  })

  it("refuses to verify in production without the trusted authorities", async () => {
    const settings: SignatureSettings = { trustedBundle: null, production: true, now: () => golden.now }
    expect(await outcome(golden.statement, golden.cases[0].cms, settings)).toEqual({
      error: "No se puede verificar la firma: falta configurar las entidades certificadoras de confianza. Avise a Administración.",
    })
  })

  it("fails loudly when the configured bundle file is missing outside production", async () => {
    const settings: SignatureSettings = { trustedBundle: path.join(root, "missing.pem"), production: false, now: () => golden.now }
    await expect(verifyCmsSignature(golden.statement, golden.cases[0].cms, settings)).rejects.toThrow("No se encontró el archivo de entidades certificadoras de confianza.")
  })
})

describe("SignerHolderMatcher", () => {
  it.each(golden.holders.map((item) => [item.holder, item.account, item.matches] as const))("«%s» against «%s» is %s", (holder, account, matches) => {
    expect(holderMatches(holder, account)).toBe(matches)
  })
})
