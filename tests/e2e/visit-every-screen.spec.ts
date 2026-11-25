import type { Page } from "@playwright/test"
import { routeTable } from "../../src/lib/routeTable"
import { storageStateOf, type AccountKey } from "./support/accounts"
import { expect, test, watchPage } from "./support/fixtures"

type Visit = { path: string; landsOn?: RegExp }

const ownRoutes = (prefix: string): string[] =>
  routeTable.filter((route) => route.path.startsWith(prefix) && !route.path.includes(":") && !route.redirect).map((route) => route.path)

async function expectScreen(page: Page, visit: Visit): Promise<void> {
  await page.goto(visit.path)
  await page.waitForLoadState("networkidle")
  if (visit.landsOn) await expect(page).toHaveURL(visit.landsOn)
  else await expect(page).toHaveURL(new RegExp(`${visit.path.replace(/[?]/g, "\\?")}$`))
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
  await expect(page.getByText("Página no encontrada")).toHaveCount(0)
  await expect(page.getByText(/No se pudo cargar|No se pudieron cargar/)).toHaveCount(0)
}

async function walk(page: Page, visits: Visit[]): Promise<void> {
  const issues = watchPage(page)
  for (const visit of visits) {
    await test.step(visit.path, () => expectScreen(page, visit))
  }
  issues.expectClean()
}

const sessionRoles = async (page: Page): Promise<{ career_id: string | null; code: string }[]> => {
  const response = await page.request.get("/api/v1/session", { headers: { Accept: "application/json", Referer: page.url() } })
  const body = (await response.json()) as { available_roles?: { career_id: string | null; code: string }[] }
  return body.available_roles ?? []
}

const roleScreens: Record<string, { key: AccountKey; visits: () => Visit[] }> = {
  administration: {
    key: "admin",
    visits: () => [
      ...ownRoutes("/admin/"),
      { path: "/admin/estructura-academica/facultades" },
      { path: "/admin/estructura-academica/carreras" },
      { path: "/admin/panel", landsOn: /\/admin\/convocatorias$/ },
      { path: "/admin/puesta-en-marcha", landsOn: /\/admin\/convocatorias$/ },
      { path: "/panel", landsOn: /\/admin\/convocatorias$/ },
      { path: "/notificaciones", landsOn: /\/admin\/notificaciones$/ },
      { path: "/configuracion/perfil", landsOn: /\/admin\/configuracion\/perfil$/ },
      { path: "/configuracion/seguridad", landsOn: /\/admin\/configuracion\/seguridad$/ },
    ].map((visit) => (typeof visit === "string" ? { path: visit } : visit)),
  },
  coordination: {
    key: "coordinator",
    visits: () => [
      ...ownRoutes("/coordinacion/").map((path) => ({ path })),
      { path: "/coordinacion/puesta-en-marcha", landsOn: /\/coordinacion\/revisiones$/ },
      { path: "/coordinacion/documentos-apoyo", landsOn: /\/coordinacion\/proyecto-carrera\?tab=documentos$/ },
      { path: "/rol", landsOn: /\/coordinacion\/revisiones$/ },
    ],
  },
  teaching: { key: "teacher", visits: () => ownRoutes("/docente/").map((path) => ({ path })) },
  library: { key: "librarian", visits: () => ownRoutes("/biblioteca/").map((path) => ({ path })) },
}

for (const [area, { key, visits }] of Object.entries(roleScreens)) {
  test.describe(`${area} screens`, () => {
    test.use({ storageState: storageStateOf(key) })

    test(`every ${area} screen loads without console errors or failed requests`, async ({ page }) => {
      await walk(page, visits())
    })
  })
}

test.describe("screens reached from data", () => {
  test.describe("teacher", () => {
    test.use({ storageState: storageStateOf("teacher") })

    test("syllabus detail, career history and documents load", async ({ page }) => {
      const issues = watchPage(page)
      await page.goto("/docente/mis-silabos")
      await page.getByRole("list", { name: "Mis sílabos" }).getByRole("heading").first().click()
      await expect(page).toHaveURL(/\/docente\/mis-silabos\/[0-9a-f-]{36}$/)
      await expect(page.getByRole("tablist", { name: "Secciones del sílabo" }).or(page.getByRole("region", { name: "Vista previa del sílabo" }))).toBeVisible()
      const career = (await sessionRoles(page)).find((role) => role.code === "docente")?.career_id
      expect(career).toBeTruthy()
      await expectScreen(page, { path: `/docente/historial/${career}`, landsOn: new RegExp(`/docente/historial(/${career})?$`) })
      issues.expectClean([new RegExp(`^http 404: GET .*/api/v1/teacher/history/${career}$`), new RegExp(`status of 404 .* @ .*/docente/historial/${career}$`)])
    })
  })

  test.describe("coordinator", () => {
    test.use({ storageState: storageStateOf("coordinator") })

    test("subject career project, review, review history and documents load", async ({ page }) => {
      const issues = watchPage(page)
      await page.goto("/coordinacion/proyecto-carrera")
      await page.getByRole("button", { name: /^Ciclo 1 / }).click()
      await page.getByRole("list", { name: "Materias del ciclo 1" }).getByRole("heading").first().click()
      await expect(page).toHaveURL(/\/coordinacion\/proyecto-carrera\/[0-9a-f-]{36}$/)
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Proyecto de carrera de")

      await page.goto("/coordinacion/revisiones?tab=seguimiento")
      await expect(page.getByRole("table", { name: "Seguimiento de la convocatoria" }).getByRole("row").nth(1)).toBeVisible()
      await page.waitForLoadState("networkidle")
      const reviewed = page.getByRole("table", { name: "Seguimiento de la convocatoria" }).getByRole("row", { name: /^Abrir revisión de / })
      test.skip((await reviewed.count()) === 0, "no syllabus has been submitted yet")
      await reviewed.first().click()
      await expect(page).toHaveURL(/\/coordinacion\/revisiones\/[0-9a-f-]{36}$/)
      const review = new URL(page.url()).pathname
      await expectScreen(page, { path: `${review}/documentos` })
      await page.goto(`${review}/historial`)
      await expect(page.getByRole("complementary", { name: "Historial de versiones" })).toBeVisible()
      issues.expectClean()
    })
  })

  test.describe("librarian", () => {
    test.use({ storageState: storageStateOf("librarian") })

    test("review detail loads", async ({ page }) => {
      const issues = watchPage(page)
      await page.goto("/biblioteca/revisiones")
      await expect(page.getByRole("table", { name: "Revisiones de biblioteca" }).getByRole("row").nth(1)).toBeVisible()
      await page.waitForLoadState("networkidle")
      const rows = page.getByRole("table", { name: "Revisiones de biblioteca" }).getByRole("row", { name: /^Abrir revisión de / })
      test.skip((await rows.count()) === 0, "no syllabus has reached the library yet")
      await rows.first().click()
      await expect(page).toHaveURL(/\/biblioteca\/revisiones\/[0-9a-f-]{36}$/)
      await expect(page.getByRole("article", { name: "Bibliografía" })).toBeVisible()
      issues.expectClean()
    })
  })
})

test.describe("removed screens", () => {
  test.use({ storageState: storageStateOf("admin") })

  test("Auditoría and Reportes are gone from the menu and answer not found", async ({ page }) => {
    await page.goto("/admin/convocatorias")
    const menu = page.getByRole("list").filter({ has: page.getByRole("link", { name: "Convocatorias" }) }).first()
    await expect(menu.getByRole("link", { name: "Usuarios y roles" })).toBeVisible()
    await expect(page.getByRole("link", { name: /Auditoría|Reportes/ })).toHaveCount(0)
    for (const path of ["/admin/auditoria", "/admin/reportes"]) {
      const response = await page.goto(path)
      expect(response?.status()).toBe(404)
      await expect(page.getByText("Página no encontrada").first()).toBeVisible()
    }
    for (const path of ["/api/v1/admin/audit-events", "/api/v1/admin/reports"]) {
      const response = await page.request.get(path, { headers: { Accept: "application/json", Referer: page.url() } })
      expect(response.status()).toBe(404)
    }
  })
})
