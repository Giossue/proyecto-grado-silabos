import { RequestMethod, type Type } from "@nestjs/common"
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants"
import { API_PREFIX } from "../config/api.config"
import { isRootPath } from "../common/http/root-paths"
import { AdminAcademicController } from "./academic/admin-academic.controller"
import { CoordinationAcademicController } from "./academic/coordination-academic.controller"
import { SupportDocumentsController } from "./academic/support-documents.controller"
import { TemplateAssistantController } from "./ai/template-assistant.controller"
import { AuthenticationController } from "./auth/authentication.controller"
import { SessionController } from "./auth/session.controller"
import { DashboardController } from "./dashboard/dashboard.controller"
import { DocumentsController } from "./exports/documents.controller"
import { FichaController } from "./ficha/ficha.controller"
import { HelpController } from "./help/help.controller"
import { KeycloakController } from "./keycloak/keycloak.controller"
import { LibraryController } from "./library/library.controller"
import { NotificationsController } from "./notifications/notifications.controller"
import { ProcessesController } from "./processes/processes.controller"
import { SettingsController } from "./settings/settings.controller"
import { CoordinationConvocationsController } from "./syllabus/coordination-convocations.controller"
import { CoordinationReviewsController } from "./syllabus/coordination-reviews.controller"
import { TeacherController } from "./syllabus/teacher.controller"
import { TemplateAssetsController } from "./template/template-assets.controller"
import { TemplateController } from "./template/template.controller"
import { UsersController } from "./users/users.controller"

export const PORTED_CONTROLLERS: readonly Type<unknown>[] = [
  AuthenticationController,
  SessionController,
  NotificationsController,
  AdminAcademicController,
  CoordinationAcademicController,
  SupportDocumentsController,
  CoordinationConvocationsController,
  CoordinationReviewsController,
  TeacherController,
  TemplateAssistantController,
  TemplateController,
  TemplateAssetsController,
  LibraryController,
  DashboardController,
  HelpController,
  DocumentsController,
  UsersController,
  SettingsController,
  FichaController,
  ProcessesController,
  KeycloakController,
]

export const ROUTE_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]

export type PortedHandler = { method: string; segments: string[]; controller: string }

export type PortedRoute = { methods: string[]; segments: string[]; controller: string }

const paths = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [String(value ?? "")])

const segmentsOf = (...parts: string[]) =>
  parts
    .flatMap((part) => part.split("/"))
    .filter((segment) => segment !== "")
    .map((segment) => (segment.startsWith(":") ? `[${segment.slice(1)}]` : segment))

export function portedHandlers(controllers: readonly Type<unknown>[] = PORTED_CONTROLLERS): PortedHandler[] {
  const handlers: PortedHandler[] = []
  for (const controller of controllers) {
    const prototype = controller.prototype as Record<string, unknown>
    for (const name of Object.getOwnPropertyNames(prototype)) {
      const handler = prototype[name]
      if (typeof handler !== "function" || name === "constructor") continue
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined
      if (method === undefined) continue
      for (const base of paths(Reflect.getMetadata(PATH_METADATA, controller))) {
        for (const path of paths(Reflect.getMetadata(PATH_METADATA, handler))) {
          const route = segmentsOf(base, path).join("/")
          handlers.push({ method: RequestMethod[method], segments: isRootPath(route) ? segmentsOf(route) : segmentsOf(API_PREFIX, route), controller: controller.name })
        }
      }
    }
  }
  return handlers
}

export function portedRoutes(controllers: readonly Type<unknown>[] = PORTED_CONTROLLERS): PortedRoute[] {
  const routes = new Map<string, PortedRoute>()
  for (const { method, segments, controller } of portedHandlers(controllers)) {
    const key = segments.join("/")
    const route = routes.get(key) ?? { methods: [], segments, controller }
    for (const verb of method === "ALL" ? ROUTE_METHODS : [method]) if (!route.methods.includes(verb)) route.methods.push(verb)
    routes.set(key, route)
  }
  return [...routes.values()]
}
