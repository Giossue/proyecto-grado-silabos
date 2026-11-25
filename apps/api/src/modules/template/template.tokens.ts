import { randomUUID } from "node:crypto"
import { postMaxSize } from "../../server/files/uploads"
import { uuid7 } from "../../server/http/uuid7"
import { storageWriter, type StorageWriter } from "../../server/http/storageWriter"

export const TEMPLATE_IDS = Symbol("TEMPLATE_IDS")
export const TEMPLATE_STORAGE = Symbol("TEMPLATE_STORAGE")
export const TEMPLATE_POST_LIMIT = Symbol("TEMPLATE_POST_LIMIT")

export type TemplateIds = { newTemplateId: () => string; newBlockId: () => string; newFieldId: () => string }

export function defaultTemplateIds(): TemplateIds {
  return { newTemplateId: uuid7, newBlockId: randomUUID, newFieldId: uuid7 }
}

export const TEMPLATE_TOKEN_PROVIDERS = [
  { provide: TEMPLATE_IDS, useFactory: defaultTemplateIds },
  { provide: TEMPLATE_STORAGE, useFactory: (): StorageWriter => storageWriter() },
  { provide: TEMPLATE_POST_LIMIT, useFactory: (): number => postMaxSize() },
]
