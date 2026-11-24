import { templateIndex } from "@/server/configuration/templateBuilder"
import { createTemplateHandler } from "@/server/configuration/templateProvisionerHandlers"
import { laravelRouterHandler } from "@/server/laravel/router"

export async function GET(request: Request): Promise<Response> {
  return templateIndex(request)
}

export async function POST(request: Request): Promise<Response> {
  return createTemplateHandler(request)
}

export { laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
