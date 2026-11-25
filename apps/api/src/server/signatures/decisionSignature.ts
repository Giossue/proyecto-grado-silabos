import { isRecord } from "../configuration/phpValues"
import { SignatureRejected } from "./cmsVerifier"

export type DecisionSignature = { statement: string; cms: string }

const MAX_STATEMENT = 500
const MAX_CMS = 200000

export function decisionSignatureFrom(input: unknown): DecisionSignature | null {
  if (input === null || input === undefined) return null
  const statement = isRecord(input) ? input.statement : undefined
  const cms = isRecord(input) ? input.cms : undefined
  if (
    typeof statement !== "string" ||
    typeof cms !== "string" ||
    statement === "" ||
    cms === "" ||
    Buffer.byteLength(statement, "utf8") > MAX_STATEMENT ||
    Buffer.byteLength(cms, "utf8") > MAX_CMS
  ) {
    throw new SignatureRejected("La firma no es válida.")
  }
  return { statement, cms }
}
