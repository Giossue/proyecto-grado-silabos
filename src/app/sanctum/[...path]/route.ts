import { laravelFallback } from "@/server/laravel/proxy"

export {
  laravelFallback as GET,
  laravelFallback as HEAD,
  laravelFallback as POST,
  laravelFallback as PUT,
  laravelFallback as PATCH,
  laravelFallback as DELETE,
  laravelFallback as OPTIONS,
}
