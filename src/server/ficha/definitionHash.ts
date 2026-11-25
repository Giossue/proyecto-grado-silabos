import { createHash } from "node:crypto"

function legacyJson(value: unknown): string {
  return JSON.stringify(value).replace(/[/\u0080-￿]/g, (character) =>
    character === "/" ? "\\/" : "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0"),
  )
}

export function definitionHash(content: unknown): string {
  return createHash("sha256").update(legacyJson(content), "utf8").digest("hex")
}
