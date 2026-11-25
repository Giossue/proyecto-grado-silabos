import { unmatchedRoute, unmatchedRouteHandler } from "@/server/http/router"
import { closeProcess } from "@/server/syllabus/processClosing"
import { pauseProcess } from "@/server/syllabus/processes"
import { resumeProcess } from "@/server/syllabus/processWrites"

type Context = { params: Promise<{ process: string; transition: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { process, transition } = await context.params
  if (transition === "pausar") return pauseProcess(request, process)
  if (transition === "reanudar") return resumeProcess(request, process)
  if (transition === "cerrar") return closeProcess(request, process)
  return unmatchedRoute(request)
}

export { unmatchedRouteHandler as GET, unmatchedRouteHandler as HEAD, unmatchedRouteHandler as PUT, unmatchedRouteHandler as PATCH, unmatchedRouteHandler as DELETE, unmatchedRouteHandler as OPTIONS }
