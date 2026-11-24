import type { PhpValue } from "../laravel/input"
import { detectMimeType } from "./mimeType"
import { imageSize, PNG_SIGNATURE } from "./png"
import { clientExtension, type UploadedFile } from "./uploads"

export const INSTITUTION_LOGO = { width: 1012, height: 190 }
export const FACULTY_LOGO = { width: 600, height: 180 }
export const MAX_LOGO_PIXELS = 4000
const MAX_LOGO_KILOBYTES = 4096
const PHP_EXTENSIONS = ["php", "php3", "php4", "php5", "php7", "php8", "phtml", "phar"]

export function isUploadedFile(value: unknown): value is UploadedFile {
  return typeof value === "object" && value !== null && "bytes" in value && Buffer.isBuffer((value as UploadedFile).bytes)
}

function filled(value: PhpValue | UploadedFile | undefined): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === "string") return value.trim() !== ""
  if (isUploadedFile(value)) return true
  if (typeof value === "object") return Object.keys(value).length > 0
  return true
}

function transparentPngProblem(file: UploadedFile): string | null {
  const header = file.bytes.subarray(0, 26)
  if (header.length < 26 || !header.subarray(0, 8).equals(PNG_SIGNATURE)) return "El archivo debe ser un PNG."
  return [4, 6].includes(header[25]) ? null : "El logo debe ser un PNG sin fondo (con transparencia)."
}

export function logoErrors(value: PhpValue | UploadedFile | undefined, label: string, required: boolean): string[] {
  if (!filled(value)) return required ? [`El campo ${label} es obligatorio.`] : []
  const errors: string[] = []
  const add = (message: string) => {
    if (!errors.includes(message)) errors.push(message)
  }
  if (!isUploadedFile(value)) {
    add(`El campo ${label} debe ser un archivo.`)
    add(`El campo ${label} debe ser un archivo de tipo: image/png.`)
    if (typeof value === "string" && [...value].length > MAX_LOGO_KILOBYTES) add(`El campo ${label} no debe tener más de ${MAX_LOGO_KILOBYTES} caracteres.`)
    add("Suba un archivo PNG.")
    return errors
  }
  const extension = clientExtension(value.originalName).trim().toLowerCase()
  if (PHP_EXTENSIONS.includes(extension) || detectMimeType(value.bytes) !== "image/png") add(`El campo ${label} debe ser un archivo de tipo: image/png.`)
  if (value.bytes.length / 1024 > MAX_LOGO_KILOBYTES) add(`El campo ${label} no debe pesar más de ${MAX_LOGO_KILOBYTES} kilobytes.`)
  const size = imageSize(value.bytes)
  if (size !== null && (size.width > MAX_LOGO_PIXELS || size.height > MAX_LOGO_PIXELS)) add(`El logo no puede superar ${MAX_LOGO_PIXELS} × ${MAX_LOGO_PIXELS} píxeles.`)
  const problem = transparentPngProblem(value)
  if (problem !== null) add(problem)
  return errors
}
