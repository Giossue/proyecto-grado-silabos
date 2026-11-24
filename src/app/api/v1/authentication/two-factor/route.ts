import { proxyToLaravel } from "@/server/laravel/proxy"
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

export { proxyToLaravel as HEAD, proxyToLaravel as PUT, proxyToLaravel as PATCH, proxyToLaravel as OPTIONS }
