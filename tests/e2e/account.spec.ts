import { storageStateOf } from "./support/accounts"
import { expect, test } from "./support/fixtures"
import type { Locator, Page } from "@playwright/test"
import { toast } from "./support/ui"

async function saveWith(page: Page, button: Locator): Promise<void> {
  const saved = page.waitForResponse((response) => ["PUT", "PATCH", "POST"].includes(response.request().method()) && response.url().includes("/api/v1/"))
  await button.click()
  expect((await saved).ok()).toBe(true)
}

test.use({ storageState: storageStateOf("teacher") })

test.describe.serial("account", () => {
  test("notifications: list, filter, mark read, open and mark all read", async ({ page, issues }) => {
    await page.goto("/docente/notificaciones")
    await expect(page.getByRole("heading", { level: 1, name: "Notificaciones" })).toBeVisible()
    const articles = page.getByRole("main").getByRole("article")
    const filters = page.getByRole("navigation", { name: "Filtrar notificaciones" })
    const listed = page.waitForResponse((response) => /\/notifications\?/.test(response.url()) && !response.url().includes("status=unread"))
    await filters.getByRole("button", { name: "Todas" }).click()
    await listed
    await expect(articles.first()).toBeVisible()
    const texts = await articles.allInnerTexts()
    const index = texts.findIndex((text) => text.includes("Nueva"))
    if (index >= 0) {
      await articles.nth(index).getByRole("button", { name: "Marcar leída" }).click()
      await expect(articles.nth(index)).not.toContainText("Nueva")
      await expect(articles.nth(index).getByRole("button", { name: "Marcar leída" })).toHaveCount(0)
    }
    const unreadListed = page.waitForResponse((response) => response.url().includes("status=unread"))
    await filters.getByRole("button", { name: "No leídas" }).click()
    await unreadListed
    await expect(articles.filter({ hasNotText: "Nueva" })).toHaveCount(0)
    for (const text of await page.getByRole("main").getByRole("article").allInnerTexts()) expect(text).toContain("Nueva")
    await page.getByRole("navigation", { name: "Filtrar notificaciones" }).getByRole("button", { name: "Todas" }).click()
    const openable = page.getByRole("main").getByRole("article").filter({ has: page.getByRole("button", { name: "Abrir" }) }).first()
    if (await openable.isVisible()) {
      await openable.getByRole("button", { name: "Abrir" }).click()
      await expect(page).not.toHaveURL(/\/docente\/notificaciones$/)
      await page.goto("/docente/notificaciones")
    }
    await page.getByRole("button", { name: /^Notificaciones/ }).first().click()
    const sheet = page.getByRole("dialog", { name: "Notificaciones" })
    await expect(sheet).toBeVisible()
    await sheet.getByRole("button", { name: "Cerrar notificaciones" }).click()
    await expect(sheet).toBeHidden()
    const markAll = page.getByRole("button", { name: "Marcar todas como leídas" })
    if (await markAll.isEnabled()) {
      const marked = page.waitForResponse((response) => /notifications\/read-all$/.test(response.url()))
      await markAll.click()
      expect((await marked).ok()).toBe(true)
      await page.reload()
      await filters.getByRole("button", { name: "Todas" }).click()
      await expect(page.getByRole("main").getByRole("article").first()).toBeVisible()
      await expect(page.getByRole("main").getByRole("article").filter({ hasText: "Nueva" })).toHaveCount(0)
    }
    issues.expectClean()
  })

  test("profile shows the account data read-only", async ({ page, issues }) => {
    await page.goto("/docente/configuracion/perfil")
    await expect(page.getByRole("textbox", { name: "Correo electrónico" })).toHaveValue("docente1@email.com")
    await expect(page.getByRole("textbox", { name: "Nombre completo" })).toBeDisabled()
    issues.expectClean()
  })

  test("email preferences are saved and restored", async ({ page, issues }) => {
    await page.goto("/docente/configuracion/notificaciones")
    const digest = page.getByRole("switch", { name: "Resumen diario" })
    const save = page.getByRole("button", { name: "Guardar" })
    const initial = (await digest.getAttribute("aria-checked")) === "true"
    await digest.click()
    await saveWith(page, save)
    await expect(toast(page)).toBeVisible()
    await page.reload()
    await expect(digest).toHaveAttribute("aria-checked", String(!initial))
    await digest.click()
    await saveWith(page, save)
    await page.reload()
    await expect(digest).toHaveAttribute("aria-checked", String(initial))
    issues.expectClean()
  })

  test("teacher formation is saved and restored", async ({ page, issues }) => {
    await page.goto("/docente/configuracion/perfil-docente")
    const formation = page.getByRole("textbox", { name: "Formación y experiencia académica-investigativa (obligatorio)" })
    const original = await formation.inputValue()
    const save = page.getByRole("button", { name: "Guardar" })
    await formation.fill(`${original} Proyecto E2E.`)
    await saveWith(page, save)
    await expect(toast(page)).toBeVisible()
    await page.reload()
    await expect(formation).toHaveValue(`${original} Proyecto E2E.`)
    await formation.fill(original)
    await saveWith(page, save)
    await page.reload()
    await expect(formation).toHaveValue(original)
    issues.expectClean()
  })

  test("accessibility preferences apply and reset", async ({ page, issues }) => {
    await page.goto("/docente/mis-silabos")
    const html = page.locator("html")
    await page.getByRole("button", { name: "Accesibilidad" }).click()
    const dialog = page.getByRole("dialog", { name: "Accesibilidad" })
    await dialog.getByRole("radio", { name: "Grande", exact: true }).click()
    await expect(html).not.toHaveAttribute("data-text-size", "100")
    await dialog.getByRole("switch", { name: "Alto contraste" }).click()
    await expect(html).toHaveAttribute("data-contrast", /high|alto|more/)
    await dialog.getByRole("button", { name: "Restablecer" }).click()
    await expect(html).toHaveAttribute("data-text-size", "100")
    await expect(html).toHaveAttribute("data-contrast", "normal")
    await dialog.getByRole("button", { name: "Cerrar" }).last().click()
    await expect(dialog).toBeHidden()
    issues.expectClean()
  })

  test("theme toggle switches to dark and back", async ({ page, issues }) => {
    await page.goto("/docente/mis-silabos")
    const html = page.locator("html")
    await page.getByRole("button", { name: "Tema visual: Claro. Cambiar a Oscuro" }).click()
    await expect(html).toHaveClass(/dark/)
    await page.reload()
    await expect(html).toHaveClass(/dark/)
    await page.getByRole("button", { name: "Tema visual: Oscuro. Cambiar a Claro" }).click()
    await expect(html).not.toHaveClass(/dark/)
    issues.expectClean()
  })
})
