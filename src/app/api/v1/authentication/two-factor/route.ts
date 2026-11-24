import { laravelRouterHandler } from "@/server/laravel/router"
import { twoFactorStatus } from "@/server/identity/session"
import { disableTwoFactor, enableTwoFactor } from "@/server/identity/twoFactor"

export function GET(request: Request): Promise<Response> {
  return twoFactorStatus(request)
}

export function POST(request: Request): Promise<Response> {
  return enableTwoFactor(request)
}

export function DELETE(request: Request): Promise<Response> {
  return disableTwoFactor(request)
}

export { laravelRouterHandler as PUT, laravelRouterHandler as PATCH, laravelRouterHandler as OPTIONS }
