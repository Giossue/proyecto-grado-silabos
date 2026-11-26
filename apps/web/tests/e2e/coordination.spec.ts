import fs from "node:fs"
import path from "node:path"
import { expect, test } from "./support/fixtures"
import { fillWorkbookCell, writeDocx, writePdf } from "./support/files"
import { storageStateOf } from "./support/accounts"
import { expireInvitation, query } from "./support/db"
import { chooseOption, confirmPurgeIfAsked, lettersOnly, dragBetween, rowNamed, toast, uniqueSuffix } from "./support/ui"

test.use({ storageState: storageStateOf("coordinator") })

const requirementsOf = (code: string) =>
  query("select 1 from requisitos_asignatura r join asignaturas a on a.asignatura_id = r.asignatura_id where a.codigo_asignatura = $1", [code])

const pausedStatus = "El periodo académico de su carrera está en pausa"

async function setConvocation(page: import("@playwright/test").Page, action: "Pausar" | "Reanudar"): Promise<void> {
  await page.goto("/coordinacion/revisiones")
  const button = page.getByRole("button", { name: `${action} periodo académico` })
  await button.click()
  const dialog = page.getByRole("dialog", { name: `${action} el periodo académico` })
  await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeVisible()
  await dialog.getByRole("button", { name: action, exact: true }).click()
  await expect(dialog).toBeHidden()
}

test.describe.serial("coordination", () => {
  const suffix = uniqueSuffix()
  const subjectName = `Materia E2E ${suffix}`

  const ensureOpen = async (browser: import("@playwright/test").Browser, baseURL: string | undefined) => {
    const context = await browser.newContext({ baseURL, storageState: storageStateOf("coordinator") })
    const page = await context.newPage()
    await page.goto("/coordinacion/revisiones")
    const pause = page.getByRole("button", { name: "Pausar periodo académico" })
    const resume = page.getByRole("button", { name: "Reanudar periodo académico" })
    await expect(pause.or(resume)).toBeVisible()
    if (await resume.isVisible()) await setConvocation(page, "Reanudar")
    await expect(pause).toBeVisible()
    await context.close()
  }

  test.beforeAll(async ({ browser }, testInfo) => ensureOpen(browser, testInfo.project.use.baseURL))
  test.afterAll(async ({ browser }, testInfo) => ensureOpen(browser, testInfo.project.use.baseURL))

  test("pause asks for confirmation and can be cancelled", async ({ page, issues }) => {
    await page.goto("/coordinacion/revisiones")
    await page.getByRole("button", { name: "Pausar periodo académico" }).click()
    const dialog = page.getByRole("dialog", { name: "Pausar el periodo académico" })
    await expect(dialog).toContainText("Durante la pausa puede corregir la malla y los datos curriculares")
    await dialog.getByRole("button", { name: "Cancelar" }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole("button", { name: "Pausar periodo académico" })).toBeVisible()
    issues.expectClean()
  })

  test("coordinator pauses the convocation", async ({ page, issues }) => {
    await page.goto("/coordinacion/malla")
    await expect(page.getByRole("button", { name: "Editar malla" })).toBeDisabled()
    await setConvocation(page, "Pausar")
    await page.getByRole("button", { name: "Plazo: En pausa" }).click()
    await expect(page.getByRole("dialog").getByText(pausedStatus)).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("button", { name: "Reanudar periodo académico" })).toBeVisible()
    issues.expectClean()
  })

  test("coordinator edits the curriculum: subject, requirement, drag and layout", async ({ page, issues }) => {
    await page.goto("/coordinacion/malla")
    await page.getByRole("button", { name: "Editar malla" }).click()
    const canvas = page.getByRole("application")
    await canvas.getByRole("button", { name: "Agregar materia" }).last().click()
    const form = page.getByRole("dialog", { name: "Agregar materia" })
    await form.getByLabel("Código").fill(`E2E-${suffix}`)
    await form.getByLabel("Nombre").fill(subjectName)
    await form.getByRole("combobox", { name: /^Unidad de organización curricular/ }).click()
    await page.getByRole("option", { name: "Unidad básica" }).click()
    for (const [label, value] of [["ACD", "48"], ["APE", "32"], ["AA", "64"], ["CRED", "3"]]) {
      await form.getByLabel(new RegExp(`^${label}\\b`)).fill(value)
    }
    await expect(form.getByLabel(/^TOTAL\b/)).toHaveValue("144")
    await form.getByRole("button", { name: "Agregar materia" }).click()
    await expect(form).toBeHidden()
    await confirmPurgeIfAsked(page)
    const created = canvas.getByRole("article", { name: new RegExp(`${subjectName}$`) })
    await expect(created).toBeVisible()

    const node = (name: string) => canvas.getByRole("group").filter({ has: page.getByRole("article", { name: new RegExp(`: ${name}$`) }) })
    await dragBetween(
      page,
      node("Estructura de Datos").getByRole("button", { name: "Conectar a la materia que requiere esta" }),
      node(subjectName).getByRole("button", { name: "Conectar el requisito de esta materia" }),
    )
    await confirmPurgeIfAsked(page)
    const edge = canvas.getByRole("group", { name: `Prerrequisito: Estructura de Datos → ${subjectName}` })
    await expect(edge).toBeAttached()
    await expect.poll(async () => (await requirementsOf(`E2E-${suffix}`)).length).toBe(1)

    const before = await canvas.getByRole("article").evaluateAll((articles) => articles.map((article) => article.getAttribute("aria-label")))
    const layout = page.waitForResponse((response) => /subject-layout$/.test(response.url()) && response.ok())
    await dragBetween(page, created, canvas.getByRole("article", { name: "SW-1010: BASE DE DATOS" }))
    await layout
    await expect
      .poll(async () => canvas.getByRole("article").evaluateAll((articles) => articles.map((article) => article.getAttribute("aria-label"))))
      .not.toEqual(before)
    const restored = page.waitForResponse((response) => /subject-layout$/.test(response.url()) && response.ok())
    await dragBetween(page, created, canvas.getByRole("article", { name: "SW-1010: BASE DE DATOS" }))
    await restored

    await edge.click({ force: true })
    const requirement = page.getByRole("dialog", { name: "Prerrequisito" })
    await requirement.getByRole("button").filter({ hasText: /Quitar|Eliminar/ }).click()
    await confirmPurgeIfAsked(page)
    await expect(edge).toHaveCount(0)
    await expect.poll(async () => (await requirementsOf(`E2E-${suffix}`)).length).toBe(0)

    const removeSubject = async (article: import("@playwright/test").Locator) => {
      await article.scrollIntoViewIfNeeded()
      const name = ((await article.getAttribute("aria-label")) ?? "").replace(/^[^:]+: /, "")
      await article.getByRole("button", { name: `Acciones para ${name}` }).click()
      await expect(page.getByRole("menuitem", { name: "Eliminar" })).toBeVisible()
      await page.keyboard.press("ArrowUp")
      await expect(page.getByRole("menuitem", { name: "Eliminar" })).toBeFocused()
      await page.keyboard.press("Enter")
      const deleted = page.waitForResponse((response) => response.request().method() === "DELETE" && /\/subjects\/[^/]+$/.test(response.url()))
      await page.getByRole("dialog", { name: "Eliminar materia" }).getByRole("button", { name: "Eliminar materia" }).click()
      expect((await deleted).status()).toBe(200)
      await confirmPurgeIfAsked(page)
    }
    await removeSubject(created)
    await expect(created).toHaveCount(0)
    expect(await query("select 1 from asignaturas where codigo_asignatura = $1", [`E2E-${suffix}`])).toHaveLength(0)
    for (const leftover of await query<{ code: string }>("select codigo_asignatura as code from asignaturas where nombre_asignatura like 'Materia E2E %'")) {
      await removeSubject(canvas.getByRole("article", { name: new RegExp(`^${leftover.code}: `) }))
    }
    issues.expectClean()
  })

  test("coordinator creates a career teacher, resends the activation and removes them", async ({ page, issues }) => {
    const surname = `DOCENTE ${lettersOnly(suffix)}`
    const email = `docente.e2e.${suffix.toLowerCase()}@ueb.edu.ec`
    await page.goto("/coordinacion/docentes")
    await page.getByRole("button", { name: "Crear docente" }).click()
    const create = page.getByRole("dialog", { name: "Crear docente" })
    await create.getByRole("textbox", { name: "Nombres (obligatorio)" }).fill("PRUEBA ETOE")
    await create.getByRole("textbox", { name: "Apellidos (obligatorio)" }).fill(surname)
    await create.getByRole("textbox", { name: "Correo institucional (obligatorio)" }).fill(email)
    await create.getByRole("button", { name: "Crear docente" }).click()
    await expect(create).toBeHidden()
    const row = rowNamed(page, `PRUEBA ETOE ${surname}`, "button")
    await expect(row).toContainText(email)

    await expireInvitation(email)
    await page.reload()
    await row.getByRole("button", { name: `PRUEBA ETOE ${surname}`, exact: true }).click()
    const detail = page.getByRole("dialog", { name: "Docente" })
    const resent = page.waitForResponse((response) => /\/resend-activation$/.test(response.url()))
    await detail.getByRole("button", { name: "Reenviar invitación" }).click()
    expect((await resent).status()).toBe(200)
    await expect(toast(page)).toBeVisible()

    const testRows = rowNamed(page, /^PRUEBA ETOE DOCENTE /, "button")
    while ((await testRows.count()) > 0) {
      const target = testRows.first()
      await target.getByRole("button", { name: /^PRUEBA ETOE DOCENTE / }).click()
      const dialog = page.getByRole("dialog", { name: "Docente" })
      await dialog.getByRole("button", { name: "Quitar de la carrera" }).click()
      const confirmation = page.getByRole("dialog").filter({ hasNot: page.getByRole("heading", { name: "Docente", exact: true }) }).last()
      const removed = page.waitForResponse((response) => response.request().method() === "DELETE" && /teachers/.test(response.url()))
      await confirmation.getByRole("button", { name: /Quitar/ }).last().click()
      expect((await removed).status()).toBe(200)
      await expect(page.getByRole("dialog")).toHaveCount(0)
    }
    await expect(row).toHaveCount(0)
    issues.expectClean()
  })

  test("coordinator edits a career project field and restores it", async ({ page, issues }) => {
    await page.goto("/coordinacion/proyecto-carrera")
    await page.getByRole("button", { name: /^Ciclo 1 / }).click()
    await page.getByRole("list", { name: "Materias del ciclo 1" }).getByRole("heading", { name: "Cálculo I", exact: true }).click()
    await expect(page.getByRole("heading", { level: 1, name: "Proyecto de carrera de Cálculo I" })).toBeVisible()
    const editor = page.getByRole("textbox", { name: "2. Descripción de la asignatura" })
    const original = (await editor.innerText()).trim()
    const save = page.getByRole("button", { name: "Guardar proyecto de carrera" })

    await editor.click()
    await page.keyboard.press("ControlOrMeta+End")
    await page.keyboard.type(" Incluye prácticas guiadas.", { delay: 15 })
    await save.click()
    await confirmPurgeIfAsked(page)
    await expect(toast(page)).toBeVisible()
    await page.reload()
    await expect(editor).toContainText("Incluye prácticas guiadas.")

    await editor.click()
    await page.keyboard.press("ControlOrMeta+a")
    await page.keyboard.type(original, { delay: 5 })
    await save.click()
    await confirmPurgeIfAsked(page)
    await page.reload()
    await expect(editor).toHaveText(original)
    issues.expectClean()
  })

  test("coordinator downloads the career project Excel, previews it and applies it", async ({ page, issues }, testInfo) => {
    await page.goto("/coordinacion/proyecto-carrera")
    await page.getByRole("button", { name: /^Ciclo 1 / }).click()
    await page.getByRole("list", { name: "Materias del ciclo 1" }).getByRole("heading", { name: "Cálculo I", exact: true }).click()
    const description = (await page.getByRole("textbox", { name: "2. Descripción de la asignatura" }).innerText()).trim()
    await page.goto("/coordinacion/proyecto-carrera")
    await page.getByRole("button", { name: "Importar desde Excel" }).click()
    const dialog = page.getByRole("dialog", { name: "Importar el proyecto de carrera" })
    const download = page.waitForEvent("download")
    await dialog.getByRole("button", { name: "Descargar plantilla Excel" }).click()
    const file = path.join(testInfo.outputDir, "proyecto-carrera.xlsx")
    await (await download).saveAs(file)
    expect(fs.readFileSync(file).subarray(0, 2).toString()).toBe("PK")
    const completed = path.join(testInfo.outputDir, "proyecto-carrera-completo.xlsx")
    await fillWorkbookCell(file, completed, /^01 /, "Cálculo I", description)
    await dialog.locator("#ficha-import-files").setInputFiles(completed)
    await dialog.getByRole("button", { name: "Revisar Excel" }).click()
    await expect(dialog.getByText(/^Vista previa del Excel para \d+ de \d+ materias/)).toBeVisible()
    const subject = dialog.getByRole("checkbox", { name: "Aplicar el proyecto de carrera de Cálculo I", exact: true })
    if (!(await subject.isChecked())) await subject.check()
    const apply = dialog.getByRole("button", { name: /^Aplicar a \d+ materias$/ })
    const applied = page.waitForResponse((response) => /ficha.*apply|apply/.test(response.url()) && response.request().method() !== "GET")
    await apply.click()
    await confirmPurgeIfAsked(page)
    expect((await applied).status()).toBeLessThan(400)
    await expect(toast(page)).toBeVisible()
    issues.expectClean()
  })

  test("coordinator resumes the convocation", async ({ page, issues }) => {
    await setConvocation(page, "Reanudar")
    await expect(page.getByRole("button", { name: "Plazo: En pausa" })).toBeHidden()
    await expect(page.getByRole("button", { name: "Pausar periodo académico" })).toBeVisible()
    await page.goto("/coordinacion/malla")
    await expect(page.getByRole("button", { name: "Editar malla" })).toBeDisabled()
    issues.expectClean()
  })

  test("coordinator creates, edits and reassigns a parallel", async ({ page, issues }) => {
    const code = `E${suffix}`
    await page.goto("/coordinacion/materias-asignaciones")
    await page.getByRole("cell", { name: "Cálculo III", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Paralelos y docentes de la materia" })
    await dialog.getByRole("button", { name: "Agregar paralelo" }).click()
    await dialog.getByRole("textbox", { name: "Código del nuevo paralelo" }).fill(code)
    await chooseOption(page, dialog.getByRole("combobox", { name: "Jornada del nuevo paralelo" }), "Vespertina")
    await chooseOption(page, dialog.getByRole("combobox", { name: "Docente del nuevo paralelo" }), "JUAN CARLOS GAIBOR NARANJO")
    await dialog.getByRole("button", { name: "Guardar nuevo paralelo" }).click()
    await confirmPurgeIfAsked(page)
    const created = dialog.getByRole("row").filter({ has: page.getByRole("cell", { name: code, exact: true }) })
    await expect(created).toContainText("Vespertina")

    await dialog.getByRole("button", { name: `Editar paralelo ${code}` }).click()
    await chooseOption(page, dialog.getByRole("combobox", { name: `Jornada del paralelo ${code}` }), "Nocturna")
    await chooseOption(page, dialog.getByRole("combobox", { name: `Docente del paralelo ${code}` }), "ANA LUCÍA CHÁVEZ TORRES")
    await dialog.getByRole("button", { name: `Guardar paralelo ${code}` }).click()
    await confirmPurgeIfAsked(page)
    await expect(created).toContainText("Nocturna")
    await expect(created).toContainText("ANA LUCÍA CHÁVEZ TORRES")

    await dialog.getByRole("button", { name: `Editar paralelo ${code}` }).click()
    await chooseOption(page, dialog.getByRole("combobox", { name: `Docente del paralelo ${code}` }), "JUAN CARLOS GAIBOR NARANJO")
    await dialog.getByRole("button", { name: `Guardar paralelo ${code}` }).click()
    await confirmPurgeIfAsked(page)
    await expect(created).toContainText("JUAN CARLOS GAIBOR NARANJO")
    await dialog.getByRole("button", { name: "Cerrar" }).last().click()
    await expect(rowNamed(page, "Cálculo III", "button")).toContainText(code)
    issues.expectClean()
  })

  test("coordinator uploads support documents, opens the prepared view and deletes them", async ({ page, issues }, testInfo) => {
    const pdf = writePdf(testInfo.outputDir, "guia.pdf", "Guia de practicas E2E")
    const docx = await writeDocx(testInfo.outputDir, "rubrica.docx", "Rubrica de evaluacion E2E")
    await page.goto("/coordinacion/proyecto-carrera?tab=documentos")
    const table = page.getByRole("table", { name: "Documentos de apoyo" })
    for (const [file, title] of [[pdf, `Guía E2E ${suffix}`], [docx, `Rúbrica E2E ${suffix}`]]) {
      await page.getByRole("button", { name: "Subir documento" }).click()
      const dialog = page.getByRole("dialog", { name: "Subir documento" })
      await dialog.locator("#support-document-file").setInputFiles(file)
      await dialog.locator("#support-document-title").fill(title)
      await dialog.getByRole("button", { name: "Subir", exact: true }).click()
      await expect(dialog).toBeHidden()
      await expect(table).toContainText(title)
    }
    for (const title of [`Guía E2E ${suffix}`, `Rúbrica E2E ${suffix}`]) {
      const row = rowNamed(table, title, "button")
      await expect(async () => {
        await page.reload()
        await expect(row).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 90_000 })
      const popup = page.waitForEvent("popup")
      await row.getByRole("button", { name: title, exact: true }).click()
      await expect.poll(async () => (await popup).url()).toMatch(/^blob:|\/view|\.pdf/)
      await (await popup).close()
    }
    for (const title of [`Guía E2E ${suffix}`, `Rúbrica E2E ${suffix}`]) {
      await page.getByRole("button", { name: `Eliminar ${title}` }).click()
      const dialog = page.getByRole("dialog", { name: `Eliminar ${title}` })
      await dialog.getByRole("button", { name: "Eliminar", exact: true }).click()
      await expect(dialog).toBeHidden()
      await expect(table).not.toContainText(title)
    }
    issues.expectClean()
  })
})
