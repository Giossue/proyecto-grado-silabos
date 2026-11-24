import { laravelRouter, laravelRouterHandler } from "@/server/laravel/router"
import { closeProcess } from "@/server/syllabus/processClosing"
import { pauseProcess } from "@/server/syllabus/processes"
import { resumeProcess } from "@/server/syllabus/processWrites"

type Context = { params: Promise<{ process: string; transition: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { process, transition } = await context.params
  if (transition === "pausar") return pauseProcess(request, process)
  if (transition === "reanudar") return resumeProcess(request, process)
  if (transition === "cerrar") return closeProcess(request, process)
  return laravelRouter(request)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
