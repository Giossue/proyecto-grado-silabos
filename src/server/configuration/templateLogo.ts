import "server-only"
import { stat } from "node:fs/promises"
import { defaultBridgeDeps } from "../auth/requireSession"
import type { BridgeDeps } from "../auth/types"
import { INSTITUTION_LOGO, logoErrors } from "../files/logos"
import { fitPng, PngError } from "../files/png"
import { isMultipart, laravelMultipart, postMaxSize, postTooLarge } from "../files/uploads"
import { isJsonRequest, laravelInput } from "../laravel/input"
import { laravelRoot } from "../laravel/request"
import { laravelJson, validationError } from "../laravel/responses"
import { storageWriter, type StorageWriter } from "../laravel/storageWriter"
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
  const original = request.clone()
  const body = isMultipart(request) ? await laravelMultipart(request.clone()) : request.headers.get("content-type") === null || isJsonRequest(request) ? { input: await laravelInput(request.clone()), files: {} } : null
  if (body === null || body.input._token !== undefined) return deps.bridge.forward(original)
  const bound = await boundTemplate(request, templateId, deps)
  if (bound instanceof Response) return bound
  if (!managesTemplates(bound.session)) return laravelJson({ message: FORBIDDEN }, 403)
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
  return laravelJson({ message: "Logo actualizado.", logo: `${laravelRoot(request)}/logos/institucion?v=${version}` })
}
