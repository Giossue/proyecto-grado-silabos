import { templateSchema } from "@/server/configuration/templateReads"
import { laravelRouterHandler } from "@/server/laravel/router"

export function GET(request: Request): Promise<Response> {
  return templateSchema(request)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
