import "server-only"
import { isUuid } from "../academic/structure"
import { fromController } from "../auth/controllerResponse"
import { defaultBridgeDeps } from "../auth/requireSession"
import { withWriter, type SessionWriterDeps } from "../auth/sessionWriter"
import { statefulRequest } from "../auth/statefulRequest"
import { binaryFileResponse } from "../files/binaryFileResponse"
import { expectsJson } from "../laravel/request"
import { laravelRouter, modelNotFound, routeAllows, unknownRoute } from "../laravel/router"
import { createLogoStore, facultyPath, institutionPath, type LogoStore } from "./institutionalLogos"

export type LogoRouteDeps = { writer: SessionWriterDeps; store: LogoStore }

const FACULTY_MODEL = "App\\Modules\\Academic\\Infrastructure\\Persistence\\Models\\Faculty"

function defaultLogoRouteDeps(): LogoRouteDeps {
  return { writer: withWriter(defaultBridgeDeps()), store: createLogoStore() }
}

async function logoFile(request: Request, file: string): Promise<Response> {
  const response = fromController(await binaryFileResponse(request, file, { "Cache-Control": "max-age=300, public" }))
  response.headers.set("Cross-Origin-Resource-Policy", "cross-origin")
  return response
}

export function institutionLogo(request: Request, deps: LogoRouteDeps = defaultLogoRouteDeps()): Promise<Response> {
  return statefulRequest(request, deps.writer, { group: "web", routeName: "logos.institution" }, async () => logoFile(request, await institutionPath()))
}

export async function facultyLogo(request: Request, facultyId: string, deps: LogoRouteDeps = defaultLogoRouteDeps()): Promise<Response> {
  if (!routeAllows(request)) return laravelRouter(request)
  return statefulRequest(request, deps.writer, { group: "web", routeName: "logos.faculty" }, async () => {
    const faculty = isUuid(facultyId) ? await deps.store.faculty(facultyId) : null
    if (faculty === null) return expectsJson(request) ? modelNotFound(FACULTY_MODEL, facultyId) : unknownRoute(request)
    return logoFile(request, await facultyPath(faculty))
  })
}
