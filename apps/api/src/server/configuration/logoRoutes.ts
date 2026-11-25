import { isUuid } from "../academic/structure"
import { fromController } from "../auth/controllerResponse"
import { binaryFileResponse } from "../files/binaryFileResponse"
import { expectsJson } from "../http/request"
import { publicPath } from "../http/storage"
import { unmatchedRoute, modelNotFound, routeAllows, unknownRoute } from "../http/router"
import type { FileSource } from "../storage/fileSource"
import { createLogoStore, facultyFile, institutionFile, type LogoStore } from "./institutionalLogos"

export type LogoRouteDeps = { store: LogoStore }

const FACULTY_MODEL = "App\\Modules\\Academic\\Infrastructure\\Persistence\\Models\\Faculty"

function defaultLogoRouteDeps(): LogoRouteDeps {
  return { store: createLogoStore() }
}

async function logoFile(request: Request, file: FileSource): Promise<Response> {
  const response = fromController(await binaryFileResponse(request, file, { "Cache-Control": "max-age=300, public" }))
  response.headers.set("Cross-Origin-Resource-Policy", "cross-origin")
  return response
}

export async function institutionLogo(request: Request): Promise<Response> {
  return logoFile(request, await institutionFile())
}

export async function facultyLogo(request: Request, facultyId: string, deps: LogoRouteDeps = defaultLogoRouteDeps()): Promise<Response> {
  if (!routeAllows(request)) return unmatchedRoute(request)
  const faculty = isUuid(facultyId) ? await deps.store.faculty(facultyId) : null
  if (faculty === null) return expectsJson(request) ? modelNotFound(FACULTY_MODEL, facultyId) : unknownRoute(request)
  return logoFile(request, await facultyFile(faculty))
}

const PUBLIC_SYLLABUS_IMAGES = new Set(["facultad.jpeg", "logo-universidad.png", "ueb.jpeg"])

export async function publicSyllabusImage(request: Request, file: string): Promise<Response> {
  if (!PUBLIC_SYLLABUS_IMAGES.has(file) || !["GET", "HEAD"].includes(request.method)) return unknownRoute(request)
  return binaryFileResponse(request, publicPath(`images/silabo/${file}`), { "Cache-Control": "max-age=300, public" })
}
