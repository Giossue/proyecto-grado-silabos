import path from "node:path"
import { expect, type Locator, type Page } from "@playwright/test"
import { certificatePassword, signaturesDir, type Account } from "./accounts"
import { chooseOption, confirmPurgeIfAsked, uniqueSuffix } from "./ui"

const autosaveUrl = /\/api\/v1\/teacher\/syllabi\/[^/]+\/fields\/[^/]+$/

export function autosaved(page: Page): Promise<unknown> {
  return page.waitForResponse((response) => autosaveUrl.test(response.url()) && response.request().method() === "PATCH" && response.ok())
}

const trackers = new WeakMap<Page, { pending: number; last: number }>()

export function trackAutosave(page: Page): void {
  if (trackers.has(page)) return
  const state = { pending: 0, last: Date.now() }
  trackers.set(page, state)
  const isSave = (url: string, method: string) => autosaveUrl.test(url) && method === "PATCH"
  page.on("request", (request) => {
    if (!isSave(request.url(), request.method())) return
    state.pending += 1
    state.last = Date.now()
  })
  const done = (request: { url(): string; method(): string }) => {
    if (!isSave(request.url(), request.method())) return
    state.pending -= 1
    state.last = Date.now()
  }
  page.on("requestfinished", done)
  page.on("requestfailed", done)
}

export async function settleAutosave(page: Page, quietMs = 1_200): Promise<void> {
  const state = trackers.get(page)
  if (!state) throw new Error("trackAutosave(page) must run before settleAutosave(page)")
  const started = Date.now()
  await expect
    .poll(() => state.pending === 0 && Date.now() - Math.max(state.last, started) >= quietMs, { timeout: 30_000, intervals: [200] })
    .toBe(true)
}

export const teacherListItem = (page: Page, subject: string, parallel = "A"): Locator =>
  page
    .getByRole("list", { name: "Mis sílabos" })
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: subject, exact: true }) })
    .filter({ has: page.getByText(`Paralelo: ${parallel}`, { exact: true }) })

export async function openTeacherSyllabus(page: Page, subject: string, parallel = "A"): Promise<void> {
  await page.goto("/docente/mis-silabos")
  await teacherListItem(page, subject, parallel).getByRole("heading", { name: subject, exact: true }).click()
  await expect(page.getByRole("heading", { level: 1, name: subject })).toBeVisible()
}

export async function restartFromReview(page: Page, subject: string, reason: string): Promise<void> {
  await page.getByRole("button", { name: "Más" }).click()
  await page.getByRole("menuitem", { name: "Reiniciar sílabo" }).click()
  const dialog = page.getByRole("dialog", { name: `Reiniciar «${subject}»` })
  await dialog.locator("#restart-reason").fill(reason)
  const phrase = dialog.locator("#restart-name")
  if (await phrase.isVisible()) await phrase.fill(subject)
  const reset = page.waitForResponse((response) => /\/reset$/.test(response.url()) && response.request().method() === "POST")
  await dialog.getByRole("button", { name: /Reiniciar/ }).last().click()
  expect((await reset).status()).toBe(200)
  await expect(dialog).toBeHidden()
}

export async function openCoordinationReview(page: Page, subject: string): Promise<void> {
  await page.goto("/coordinacion/revisiones")
  await page.getByRole("table", { name: "Revisiones de coordinación" }).getByRole("row", { name: `Abrir revisión de ${subject}` }).click()
  await expect(page.getByRole("heading", { level: 1, name: subject })).toBeVisible()
}

export async function openTrackedReview(page: Page, subject: string, parallel = "A"): Promise<void> {
  await page.goto("/coordinacion/revisiones?tab=seguimiento")
  await page
    .getByRole("table", { name: "Seguimiento de la convocatoria" })
    .getByRole("row", { name: `Abrir revisión de ${subject}` })
    .filter({ has: page.getByText(`Paralelo ${parallel}`, { exact: true }) })
    .click()
  await expect(page.getByRole("heading", { level: 1, name: subject })).toBeVisible()
}

export async function approvedRevisionOf(page: Page): Promise<string> {
  const syllabus = new URL(page.url()).pathname.split("/").pop()
  const response = await page.request.get(`/api/v1/teacher/syllabi/${syllabus}`, { headers: { Accept: "application/json", Referer: page.url() } })
  expect(response.ok()).toBe(true)
  const body = (await response.json()) as { syllabus: { approved_revision_id: string | null } }
  expect(body.syllabus.approved_revision_id).toBeTruthy()
  return body.syllabus.approved_revision_id!
}

export const stampCount = (text: string): number => (text.match(/Firmado electrónicamente por/gi) ?? []).length

export async function openSection(page: Page, name: string | RegExp): Promise<void> {
  const tab = page.getByRole("tablist", { name: "Secciones del sílabo" }).getByRole("tab", { name })
  await tab.click()
  await expect(tab).toHaveAttribute("aria-selected", "true")
}

async function fillAll(scope: Locator, valueFor: (name: string, index: number) => string): Promise<void> {
  const boxes = scope.getByRole("textbox")
  const count = await boxes.count()
  for (let index = 0; index < count; index += 1) {
    const box = boxes.nth(index)
    if (!(await box.isEditable())) continue
    const name = (await box.getAttribute("aria-label")) ?? ""
    await box.fill(valueFor(name, index))
  }
}

const weeklyHours: Record<string, string> = { ACD: "3", APE: "2", AA: "4" }
const hoursOf = (name: string): string | undefined => weeklyHours[name.split(",")[0] ?? ""]

export async function fillIdentification(page: Page, description: string): Promise<void> {
  await openSection(page, "1. Identificación institucional")
  await page.getByRole("radiogroup", { name: "Estudiantes con discapacidad" }).getByRole("radio", { name: "Sí" }).check()
  await page.getByRole("textbox", { name: "Capacidades esp (obligatorio)" }).fill("Baja visión")
  await page.getByRole("textbox", { name: "Breve descripción (obligatorio)" }).fill(description)
  await settleAutosave(page)
}

export async function fillPlanning(page: Page): Promise<void> {
  await openSection(page, /^6\. Distribución/)
  const units = page.getByRole("button", { name: /^Unidad \d+/ })
  const count = await units.count()
  for (let index = 0; index < count; index += 1) {
    const toggle = units.nth(index)
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click()
    const region = page.getByRole("region", { name: new RegExp(`^Unidad ${index + 1}\\b`) })
    await region.getByRole("textbox", { name: "Nombre de la unidad (obligatorio)" }).fill(`Unidad ${index + 1}: fundamentos`)
    await region.getByRole("textbox", { name: "Resultados de aprendizaje (obligatorio)" }).fill(`Resuelve problemas de la unidad ${index + 1}`)
    await fillAll(region.getByRole("table", { name: "Semana" }), (name) => hoursOf(name) ?? `Contenido ${name}`)
  }
  await settleAutosave(page)
}

export async function fillRichText(page: Page): Promise<void> {
  await openSection(page, /^7\. Metodología/)
  const editors = page.locator('[contenteditable="true"]')
  const count = await editors.count()
  expect(count).toBeGreaterThan(0)
  for (let index = 0; index < count; index += 1) {
    const editor = editors.nth(index)
    await editor.click()
    await page.keyboard.press("ControlOrMeta+a")
    await page.keyboard.press("Delete")
    await page.keyboard.type("Aprendizaje basado en ", { delay: 20 })
    await page.keyboard.press("ControlOrMeta+b")
    await page.keyboard.type("problemas", { delay: 20 })
    await page.keyboard.press("ControlOrMeta+b")
    await page.keyboard.type(" y proyectos.", { delay: 20 })
  }
  await expect(editors.first().locator("strong")).toHaveText("problemas")
  const toolbar = page.getByRole("toolbar").first()
  await editors.first().click()
  await page.keyboard.press("End")
  await page.keyboard.press("Enter")
  await toolbar.getByRole("button", { name: "Lista con viñetas" }).click()
  await page.keyboard.type("Trabajo colaborativo", { delay: 20 })
  await settleAutosave(page)
  await expect(editors.first().locator("ul li")).toHaveText("Trabajo colaborativo")
}

export async function fillOutcomes(page: Page): Promise<void> {
  await openSection(page, /^9\. Relación/)
  const table = page.getByRole("table", { name: /^9\. Relación/ })
  await fillAll(table, (name) => (/^(ALTA|MEDIA|BAJA)/.test(name) ? (name.startsWith("ALTA") ? "X" : "") : `Resultado ${name}`))
  await settleAutosave(page)
}

export async function fillBook(page: Page, region: Locator, row: number, title: string): Promise<void> {
  const values: [string, string][] = [
    ["Autor", "García, Ana"],
    ["Título", title],
    ["Año", "2020"],
    ["Ciudad", "Quito"],
    ["Editorial", "Editorial Universitaria"],
    ["ISBN", "978-9942-00-000-0"],
    ["Código", `UEB-${row}`],
  ]
  for (const [column, value] of values) {
    await region.getByRole("textbox", { name: `${column}, libro ${row}` }).fill(value)
  }
  await settleAutosave(page)
}

export async function addFromCatalog(page: Page, group: Locator): Promise<string | null> {
  await group.getByRole("button", { name: "Buscar en la biblioteca" }).click()
  const dialog = page.getByRole("dialog", { name: "Buscar en la biblioteca" })
  await dialog.getByRole("textbox", { name: "Texto a buscar" }).fill("programación")
  const response = page.waitForResponse((candidate) => candidate.url().includes("/library-catalog/search"), { timeout: 30_000 }).catch(() => null)
  await dialog.getByRole("button", { name: "Buscar" }).click()
  const result = await response
  const add = dialog.getByRole("button", { name: /^Agregar / }).first()
  let title: string | null = null
  if (result !== null && result.ok() && (await add.isVisible({ timeout: 15_000 }).catch(() => false))) {
    title = ((await add.getAttribute("aria-label")) ?? "").replace(/^Agregar /, "")
    await add.click()
    await expect(dialog.getByRole("button", { name: `Agregar ${title}` })).toHaveText("Agregado")
    await dialog.getByRole("button", { name: "Cerrar" }).first().click()
  } else {
    await dialog.getByRole("button", { name: "Cerrar" }).first().click()
  }
  await expect(dialog).toBeHidden()
  return title
}

export async function fillBibliography(page: Page, stamp: string): Promise<{ catalogTitle: string | null }> {
  await openSection(page, /^11\. Bibliografía/)
  const basic = page.getByRole("group", { name: "Básica", exact: true })
  const catalogTitle = await addFromCatalog(page, basic)
  if (catalogTitle) {
    await settleAutosave(page)
    const titles = await basic.getByRole("textbox", { name: /^Título, libro \d+$/ }).evaluateAll((boxes) => boxes.map((box) => (box as HTMLInputElement).value))
    expect(titles).toContain(catalogTitle)
    const emptyRow = titles.findIndex((value) => value.trim() === "")
    if (emptyRow >= 0) {
      await basic.getByRole("button", { name: `Quitar libro ${emptyRow + 1}` }).click()
      await settleAutosave(page)
    }
  } else {
    await fillBook(page, basic.getByRole("region", { name: "Libro" }), 1, `Cálculo vectorial ${stamp}`)
  }
  const complementary = page.getByRole("group", { name: "Complementaria", exact: true })
  await fillBook(page, complementary.getByRole("region", { name: "Libro" }), 1, `Ecuaciones diferenciales ${stamp}`)
  return { catalogTitle }
}

export async function signWith(page: Page, dialogName: string, account: Account, confirm: string): Promise<void> {
  const dialog = page.getByRole("dialog", { name: dialogName })
  await expect(dialog).toBeVisible()
  await dialog.locator("#signature-certificate").setInputFiles(path.join(signaturesDir, account.p12))
  await dialog.locator("#signature-password").fill(certificatePassword())
  await dialog.getByRole("button", { name: confirm }).click()
  await expect(dialog).toBeHidden({ timeout: 60_000 })
}

export async function submitSyllabus(page: Page, account: Account): Promise<void> {
  const signAndSend = page.getByRole("button", { name: "Firmar y enviar", exact: true })
  if (await signAndSend.isVisible()) {
    await expect(signAndSend).toBeEnabled()
    await signAndSend.click()
    await signWith(page, "Firmar y enviar", account, "Firmar y enviar")
  } else {
    const send = page.getByRole("button", { name: "Enviar", exact: true })
    await expect(send).toBeEnabled()
    await send.click()
    const dialog = page.getByRole("dialog", { name: "¿Enviar a revisión?" })
    await expect(dialog.getByText("No ha cambiado nada desde que pidieron la corrección")).toBeHidden()
    await dialog.getByRole("button", { name: "Enviar", exact: true }).click()
  }
  await expect(page.getByText("Sílabo enviado correctamente")).toBeVisible()
  await expect(page).toHaveURL(/\/docente\/mis-silabos$/)
}

export async function addTeacherParallel(page: Page, subject: string, teacherName: string): Promise<void> {
  const code = `L${uniqueSuffix()}`
  await page.goto("/coordinacion/materias-asignaciones")
  await page.getByRole("cell", { name: subject, exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Paralelos y docentes de la materia" })
  await dialog.getByRole("button", { name: "Agregar paralelo" }).click()
  await dialog.getByRole("textbox", { name: "Código del nuevo paralelo" }).fill(code)
  await chooseOption(page, dialog.getByRole("combobox", { name: "Jornada del nuevo paralelo" }), "Vespertina")
  await chooseOption(page, dialog.getByRole("combobox", { name: "Docente del nuevo paralelo" }), teacherName)
  await dialog.getByRole("button", { name: "Guardar nuevo paralelo" }).click()
  await confirmPurgeIfAsked(page)
  await expect(dialog.getByRole("row").filter({ has: page.getByRole("cell", { name: code, exact: true }) })).toContainText(teacherName)
  await dialog.getByRole("button", { name: "Cerrar" }).last().click()
}

export async function regenerateCareerSyllabi(page: Page): Promise<void> {
  for (const action of ["Pausar", "Reanudar"]) {
    await page.goto("/coordinacion/revisiones")
    await page.getByRole("button", { name: `${action} convocatoria` }).click()
    const dialog = page.getByRole("dialog", { name: `${action} la convocatoria` })
    await dialog.getByRole("button", { name: action, exact: true }).click()
    await expect(dialog).toBeHidden()
  }
  await expect(page.getByRole("button", { name: "Pausar convocatoria" })).toBeVisible()
}

export async function submitSampleSyllabus(page: Page, account: Account, subject: string): Promise<boolean> {
  trackAutosave(page)
  await page.goto("/docente/mis-silabos")
  const item = teacherListItem(page, subject)
  await expect(item.or(page.getByText("Todavía no hay una convocatoria abierta"))).toBeVisible()
  if (!(await item.isVisible()) || !/Sin iniciar|Borrador/.test(await item.innerText())) return false
  await openTeacherSyllabus(page, subject)
  const stamp = String(Date.now())
  await fillIdentification(page, `Se adaptan materiales con letra ampliada (${stamp})`)
  await fillPlanning(page)
  await fillRichText(page)
  await fillOutcomes(page)
  await fillBibliography(page, stamp)
  await submitSyllabus(page, account)
  return true
}
