// @vitest-environment node
import "reflect-metadata"
import { Test } from "@nestjs/testing"
import type { NestExpressApplication } from "@nestjs/platform-express"
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger"
import { cleanupOpenApiDoc } from "nestjs-zod"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { configureApi } from "../../bootstrap"
import { WebResponseExpressAdapter } from "../../common/http/web-response.adapter"
import { PrismaService } from "../../prisma/prisma.service"
import { AuthModule } from "../auth/auth.module"
import { AUTH_BRIDGE, RATE_LIMITER } from "../auth/auth.tokens"
import { UsersModule } from "./users.module"

let app: NestExpressApplication

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AuthModule, UsersModule] })
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(AUTH_BRIDGE)
    .useValue({})
    .overrideProvider(RATE_LIMITER)
    .useValue({})
    .compile()
  app = moduleRef.createNestApplication<NestExpressApplication>(new WebResponseExpressAdapter(), { bodyParser: false })
  configureApi(app)
  await app.init()
})

afterAll(async () => {
  await app?.close()
})

describe("OpenAPI document of the identity routes", () => {
  it("documents every identity route with its method, body and the error answers of the contract", () => {
    const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, new DocumentBuilder().build()))
    const routes = Object.entries(document.paths).flatMap(([path, item]) => Object.keys(item as object).map((method) => `${method.toUpperCase()} ${path}`))
    expect(routes.toSorted()).toEqual(
      [
        "POST /api/v1/authentication/login",
        "POST /api/v1/authentication/logout",
        "POST /api/v1/authentication/account-activation",
        "POST /api/v1/authentication/account-activation/resend",
        "POST /api/v1/authentication/password-recovery",
        "POST /api/v1/authentication/password-reset",
        "PUT /api/v1/authentication/profile",
        "PUT /api/v1/authentication/accessibility",
        "GET /api/v1/authentication/sessions",
        "DELETE /api/v1/authentication/sessions/others",
        "DELETE /api/v1/authentication/sessions/{session}",
        "GET /api/v1/session",
        "PUT /api/v1/active-role",
        "DELETE /api/v1/active-role",
        "GET /api/v1/admin/users",
        "POST /api/v1/admin/users",
        "POST /api/v1/admin/users/import",
        "GET /api/v1/admin/users/import-template",
        "PATCH /api/v1/admin/users/{user}",
        "DELETE /api/v1/admin/users/{user}",
        "POST /api/v1/admin/users/{user}/resend-activation",
        "DELETE /api/v1/admin/users/{user}/roles/{assignment}",
      ].toSorted(),
    )
    const login = document.paths["/api/v1/authentication/login"].post
    expect(Object.keys(login?.responses ?? {}).toSorted()).toEqual(["200", "400", "422", "429"])
    expect(JSON.stringify(login?.requestBody)).toContain("LoginDto")
    expect(Object.keys(document.paths["/api/v1/admin/users/{user}"].patch?.responses ?? {})).toEqual(expect.arrayContaining(["401", "403", "404", "409", "422"]))
    expect(Object.keys(document.components?.schemas ?? {})).toEqual(expect.arrayContaining(["LoginDto", "ProfileDto", "NewManagedUserDto", "PasswordConfirmationDto"]))
  })
})
