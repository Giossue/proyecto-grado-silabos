import { requireSession } from "../auth/requireSession"
import type { BridgeDeps, AppSession } from "../auth/types"
import { detectMimeType, guessExtension } from "../files/mimeType"
import { clientExtension, isMultipart, multipartInput, postMaxSize, postTooLarge, type UploadedFile } from "../files/uploads"
import { isJsonRequest, requestInput, type PhpArray, type PhpValue } from "../http/input"
import { validationError } from "../http/responses"
import { throttle, type RateLimiter, type Throttle } from "../http/throttle"
import type { z } from "zod"
import { fieldFailures, is } from "@silabos/shared/schemas/fields"
import { spreadsheetOptionsSchema } from "@silabos/shared/schemas/imports"
import { mergeErrors, validateSchema } from "../http/schemaValidation"
import { requestBoolean } from "../syllabus/inProgressWorkHelpers"
import { readImportRows, SpreadsheetRejected, type ImportColumns, type ImportRow } from "./spreadsheetReader"

export type ImportDeps = { bridge: BridgeDeps; limiter: RateLimiter; maxPostSize?: number }

export type ImportSession = { session: AppSession; original: Request; finish: (response: Response) => Response }

export type ImportUpload = { file: UploadedFile; confirm: boolean; input: PhpArray }

export type ImportFileRules = { attribute: string; maxKilobytes: number; messages: Partial<Record<"required" | "file" | "mimes" | "max", string>> }

const PHP_EXTENSIONS = ["php", "php3", "php4", "php5", "php7", "php8", "phtml", "phar"]

export const SPREADSHEET_FILE: ImportFileRules = { attribute: "archivo", maxKilobytes: 2048, messages: {} }

function isUploadedFile(value: unknown): value is UploadedFile {
  return typeof value === "object" && value !== null && "bytes" in value && Buffer.isBuffer((value as UploadedFile).bytes)
}

export function acceptsUpload(request: Request): boolean {
  return isMultipart(request) || request.headers.get("content-type") === null || isJsonRequest(request)
}

export async function importSession(request: Request, deps: ImportDeps, limit: number | null): Promise<ImportSession | Response> {
  const tooLarge = postTooLarge(request, deps.maxPostSize ?? postMaxSize())
  if (tooLarge !== null) return tooLarge
  const original = request.clone()
  let gate: Throttle | null = null
  const session = await requireSession(
    request,
    {
      verified: true,
      activeRole: "required",
      afterAuthentication:
        limit === null
          ? undefined
          : async (user) => {
              gate = throttle(deps.limiter, { key: `throttle:${limit},1:${user.id}`, maxAttempts: limit, decaySeconds: 60 }, deps.bridge.now)
              return gate.hit()
            },
    },
    deps.bridge,
  )
  const finish = (response: Response) => (gate as Throttle | null)?.decorate(response) ?? response
  if (session instanceof Response) return finish(session)
  return { session, original, finish }
}

function fileErrors(value: PhpValue | UploadedFile | undefined, rules: ImportFileRules): Promise<string[]> | string[] {
  const label = rules.attribute
  const messages = {
    required: rules.messages.required ?? `El campo ${label} es obligatorio.`,
    file: rules.messages.file ?? `El campo ${label} debe ser un archivo.`,
    mimes: rules.messages.mimes ?? `El campo ${label} debe ser un archivo de tipo: xlsx.`,
    max: rules.messages.max ?? `El campo ${label} no debe pesar más de ${rules.maxKilobytes} kilobytes.`,
  }
  if (!isUploadedFile(value)) {
    return fieldFailures(value ?? null, label, [is.satisfying(() => false, messages.file), is.satisfying(() => false, messages.mimes), is.max(rules.maxKilobytes, rules.messages.max)], {
      required: true,
      requiredMessage: messages.required,
    })
  }
  const errors: string[] = []
  const extension = clientExtension(value.originalName).trim().toLowerCase()
  if (PHP_EXTENSIONS.includes(extension) || guessExtension(detectMimeType(value.bytes)) !== "xlsx") errors.push(messages.mimes)
  if (value.bytes.length / 1024 > rules.maxKilobytes) errors.push(messages.max)
  return errors
}

export async function readUpload(
  request: Request,
  rules: ImportFileRules,
  extra: z.ZodType | null = null,
): Promise<{ upload: ImportUpload } | { errors: Record<string, string[]> }> {
  let input: PhpArray
  let value: PhpValue | UploadedFile | undefined
  if (isMultipart(request)) {
    const body = await multipartInput(request)
    input = body.input
    value = body.files.file !== undefined ? body.files.file : input.file
  } else {
    input = await requestInput(request)
    value = input.file
  }
  const errors: Record<string, string[]> = {}
  const problems = await fileErrors(value, rules)
  if (problems.length > 0) mergeErrors(errors, "file", problems)
  const others = extra === null ? null : (await validateSchema(extra, input)).errors
  for (const [attribute, messages] of Object.entries(others ?? {})) mergeErrors(errors, attribute, messages)
  if (Object.keys(errors).length > 0) return { errors }
  return { upload: { file: value as UploadedFile, confirm: requestBoolean(input.confirm), input } }
}

export async function spreadsheetUpload(request: Request): Promise<ImportUpload | Response> {
  const read = await readUpload(request, SPREADSHEET_FILE, spreadsheetOptionsSchema)
  return "errors" in read ? validationError(read.errors) : read.upload
}

export function importRows(file: UploadedFile, columns: ImportColumns, optional: string[] = []): ImportRow[] | Response {
  try {
    return readImportRows(file.bytes, columns, optional)
  } catch (error) {
    if (error instanceof SpreadsheetRejected) return validationError({ file: [error.message] })
    throw error
  }
}

export type CheckedRow = ImportRow & { errors: string[] }

export type ImportResult = { rows: CheckedRow[]; valid: boolean; created: number }
