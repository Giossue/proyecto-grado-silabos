import { stat } from "node:fs/promises"
import { defaultBridgeDeps } from "../auth/requireSession"
import type { BridgeDeps } from "../auth/types"
import { INSTITUTION_LOGO, logoErrors } from "../files/logos"
import { fitPng, PngError } from "../files/png"
import { requestBody, postMaxSize, postTooLarge } from "../files/uploads"
import { requestRoot } from "../http/request"
import { apiJson, validationError } from "../http/responses"
import { storageWriter, type StorageWriter } from "../http/storageWriter"
import { boundTemplate, FORBIDDEN, managesTemplates } from "./templateReads"
import { createTemplateStore, type TemplateStore } from "./templateStore"

export const INSTITUTION_LOGO_PATH = "logos/institucion.png"

export type TemplateLogoDeps = { bridge: BridgeDeps; store: TemplateStore; storage: StorageWriter; maxPostSize: number }

export function defaultTemplateLogoDeps(): TemplateLogoDeps {
  return { bridge: defaultBridgeDeps(), store: createTemplateStore(), storage: storageWriter(), maxPostSize: postMaxSize() }
}

export async function uploadTemplateLogo(request: Request, templateId: string, deps: TemplateLogoDeps = defaultTemplateLogoDeps()): Promise<Response> {
  const tooLarge = postTooLarge(request, deps.maxPostSize)
  if (tooLarge !== null) return tooLarge
  const body = await requestBody(request.clone())
  const bound = await boundTemplate(request, templateId, deps)
  if (bound instanceof Response) return bound
  if (!managesTemplates(bound.session)) return apiJson({ message: FORBIDDEN }, 403)
  const logo = body.files.logo !== undefined ? body.files.logo : body.input.logo
  const errors = logoErrors(logo, "imagen del logo", true)
  if (errors.length > 0) return validationError({ logo: errors })
  let fitted: Buffer
  try {
    fitted = fitPng((logo as { bytes: Buffer }).bytes, INSTITUTION_LOGO)
  } catch (error) {
    if (error instanceof PngError) return validationError({ logo: ["No se pudo leer el PNG."] })
    throw error
  }
  await deps.storage.put("private", INSTITUTION_LOGO_PATH, fitted)
  const version = Math.floor((await stat(/*turbopackIgnore: true*/ deps.storage.path("private", INSTITUTION_LOGO_PATH))).mtimeMs / 1000)
  return apiJson({ message: "Logo actualizado.", logo: `${requestRoot(request)}/logos/institucion?v=${version}` })
}
