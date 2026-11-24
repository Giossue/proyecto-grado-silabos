import { downloadExport } from "@/server/documents/revisionDocuments"
import { laravelRouterHandler } from "@/server/laravel/router"

type Context = { params: Promise<{ artifact: string }> }

export async function GET(request: Request, context: Context): Promise<Response> {
  const { artifact } = await context.params
  return downloadExport(request, artifact)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
