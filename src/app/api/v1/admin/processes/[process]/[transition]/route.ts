import { proxyToLaravel } from "@/server/laravel/proxy"
import { pauseProcess } from "@/server/syllabus/processes"

type Context = { params: Promise<{ process: string; transition: string }> }

export async function POST(request: Request, context: Context): Promise<Response> {
  const { process, transition } = await context.params
  return transition === "pausar" ? pauseProcess(request, process) : proxyToLaravel(request)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as DELETE,
  proxyToLaravel as OPTIONS,
}
