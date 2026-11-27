import type { Locator, Page } from "@playwright/test"

export const toast = (page: Page, text?: string | RegExp): Locator => {
  const toasts = page.locator("[data-sonner-toast]")
  return text === undefined ? toasts.first() : toasts.filter({ hasText: text }).first()
}

export async function chooseOption(page: Page, trigger: Locator, option: string | RegExp): Promise<void> {
  await trigger.click()
  await page.getByRole("option", { name: option }).first().click()
}

export async function chooseFirstOption(page: Page, trigger: Locator): Promise<string> {
  await trigger.click()
  const option = page.getByRole("option").first()
  const label = ((await option.textContent()) ?? "").trim()
  await option.click()
  return label
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

const pageOf = (scope: Page | Locator): Page => ("goto" in scope ? scope : scope.page())

export const rowNamed = (scope: Page | Locator, name: string | RegExp, role: "link" | "button" = "link"): Locator =>
  scope.locator("tbody").getByRole("row").filter({ has: pageOf(scope).getByRole(role, { name, exact: typeof name === "string" }) })
