import { expect, type Page } from "@playwright/test"
import { password, type Account } from "./accounts"

export async function fillLogin(page: Page, email: string, secret: string): Promise<void> {
  await page.goto("/ingresar")
  await page.getByLabel("Correo institucional").fill(email)
  await page.locator("#password").fill(secret)
  await page.getByRole("button", { name: "Ingresar" }).click()
}

export async function chooseScope(page: Page, career: string, role: "Coordinación" | "Docencia"): Promise<void> {
  await expect(page).toHaveURL(/\/rol$/)
  const card = page.locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name: career, exact: true }) }).filter({ hasText: role })
  await card.getByRole("button", { name: "Entrar a esta carrera" }).click()
}

export async function loginAs(page: Page, account: Account, secret: string = password()): Promise<void> {
  await fillLogin(page, account.email, secret)
  await page.waitForURL((url) => !url.pathname.startsWith("/ingresar"))
  if (account.scope) await chooseScope(page, account.scope.career, account.scope.role)
  await expect(page).toHaveURL(new RegExp(`${account.home}$`))
}

export async function logout(page: Page): Promise<void> {
  await page.locator("[data-user-menu]").click()
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click()
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"))
  await dialog.getByRole("button", { name: "Cerrar sesión" }).click()
  await expect(page).toHaveURL(/\/ingresar/)
}
