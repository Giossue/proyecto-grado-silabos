import { applyFichaImport } from "@/server/ficha/fichaImports"
import { laravelRouterHandler } from "@/server/laravel/router"

export function POST(request: Request): Promise<Response> {
  return applyFichaImport(request)
}

export { laravelRouterHandler as GET, laravelRouterHandler as HEAD, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
