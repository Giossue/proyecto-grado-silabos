import { laravelRouterHandler } from "@/server/laravel/router"
import { catalogLibraries } from "@/server/library/catalogHandlers"

export function GET(request: Request): Promise<Response> {
  return catalogLibraries(request)
}

export { laravelRouterHandler as POST, laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as DELETE, laravelRouterHandler as OPTIONS }
