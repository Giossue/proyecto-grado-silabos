import { proxyToLaravel } from "@/server/laravel/proxy"
import { deleteProcess } from "@/server/syllabus/processWrites"

type Context = { params: Promise<{ process: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { process } = await context.params
  return deleteProcess(request, process)
}

export {
  proxyToLaravel as GET,
  proxyToLaravel as HEAD,
  proxyToLaravel as POST,
  proxyToLaravel as PUT,
  proxyToLaravel as PATCH,
  proxyToLaravel as OPTIONS,
}
