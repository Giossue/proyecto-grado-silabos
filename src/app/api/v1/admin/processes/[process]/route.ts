import { laravelRouterHandler } from "@/server/laravel/router"
import { deleteProcess } from "@/server/syllabus/processWrites"

type Context = { params: Promise<{ process: string }> }

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const { process } = await context.params
  return deleteProcess(request, process)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as OPTIONS }
