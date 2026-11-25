import { RequestMethod, type Type } from "@nestjs/common"
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants"
import { API_PREFIX } from "../config/api.config"
import { NotificationsController } from "./notifications/notifications.controller"

export const PORTED_CONTROLLERS: readonly Type<unknown>[] = [NotificationsController]

export type PortedRoute = { methods: string[]; segments: string[]; controller: string }

const paths = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [String(value ?? "")])

const segmentsOf = (...parts: string[]) =>
  parts
    .flatMap((part) => part.split("/"))
    .filter((segment) => segment !== "")
    .map((segment) => (segment.startsWith(":") ? `[${segment.slice(1)}]` : segment))

export function portedRoutes(controllers: readonly Type<unknown>[] = PORTED_CONTROLLERS): PortedRoute[] {
  const routes = new Map<string, PortedRoute>()
  for (const controller of controllers) {
    const prototype = controller.prototype as Record<string, unknown>
    for (const name of Object.getOwnPropertyNames(prototype)) {
      const handler = prototype[name]
      if (typeof handler !== "function" || name === "constructor") continue
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined
      if (method === undefined) continue
      for (const base of paths(Reflect.getMetadata(PATH_METADATA, controller))) {
        for (const path of paths(Reflect.getMetadata(PATH_METADATA, handler))) {
          const segments = segmentsOf(API_PREFIX, base, path)
          const key = segments.join("/")
          const route = routes.get(key) ?? { methods: [], segments, controller: controller.name }
          route.methods.push(RequestMethod[method])
          routes.set(key, route)
        }
      }
    }
  }
  return [...routes.values()]
}
