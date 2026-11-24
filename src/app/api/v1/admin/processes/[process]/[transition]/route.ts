import { proxyToLaravel } from "@/server/laravel/proxy"
import { closeProcess } from "@/server/syllabus/processClosing"
import { pauseProcess } from "@/server/syllabus/processes"
import { resumeProcess } from "@/server/syllabus/processWrites"

type Context = { params: Promise<{ process: string; transition: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { process, transition } = await context.params
  if (transition === "pausar") return pauseProcess(request, process)
  if (transition === "reanudar") return resumeProcess(request, process)
  if (transition === "cerrar") return closeProcess(request, process)
  return proxyToLaravel(request)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
