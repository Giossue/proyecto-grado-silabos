import { expect, type Locator, type Page } from "@playwright/test"

export const toast = (page: Page, text?: string | RegExp): Locator => {
  const toasts = page.locator("[data-sonner-toast]")
  return text === undefined ? toasts.first() : toasts.filter({ hasText: text }).first()
}

export async function chooseOption(page: Page, trigger: Locator, option: string | RegExp): Promise<void> {
  await trigger.click()
  await page.getByRole("option", { name: option }).first().click()
}

export async function confirmPurgeIfAsked(page: Page): Promise<boolean> {
  const dialog = page.getByRole("dialog", { name: "Este cambio afecta sílabos en curso" })
  if (!(await dialog.isVisible({ timeout: 2_000 }).catch(() => false))) return false
  await dialog.getByLabel("Escriba «devolver a borrador» para confirmar").fill("devolver a borrador")
  await dialog.getByRole("button").last().click()
  await expect(dialog).toBeHidden()
  return true
}

export async function dragBetween(page: Page, from: Locator, to: Locator): Promise<void> {
  await to.scrollIntoViewIfNeeded()
  await from.scrollIntoViewIfNeeded()
  const source = await from.boundingBox()
  const target = await to.boundingBox()
  if (!source || !target) throw new Error("Both drag ends must be visible")
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(source.x + source.width / 2 + 8, source.y + source.height / 2 + 8, { steps: 4 })
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 20 })
  await page.mouse.up()
}

export const uniqueSuffix = (): string => Date.now().toString(36).slice(-5).toUpperCase()

export const lettersOnly = (value: string): string => value.replace(/\d/g, (digit) => "ABCDEFGHIJ"[Number(digit)] ?? "A")
