import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { accounts, mailLogPaths } from "./support/accounts"
import { userName } from "./support/db"
import { expect, test, watchPage } from "./support/fixtures"
import { addTeacherParallel, fillBibliography, fillIdentification, fillOutcomes, fillPlanning, fillRichText, openCoordinationReview, openSection, approvedRevisionOf, openTrackedReview, stampCount, openTeacherSyllabus, restartFromReview, settleAutosave, teacherListItem, signWith, submitSyllabus, trackAutosave } from "./support/syllabus"

const subject = "Cálculo III"

test.describe.serial("syllabus lifecycle", () => {
  test("coordinator restarts the syllabus when a previous run left it submitted", async ({ actor }) => {
    const teacher = await actor("teacher")
    await teacher.goto("/docente/mis-silabos")
    const item = teacherListItem(teacher, subject)
    await expect(item).toBeVisible()
    const state = (await item.innerText()).trim()
    if (/Sin iniciar|Borrador/.test(state)) {
      test.info().annotations.push({ type: "precondition", description: `the syllabus is already editable (${state}), nothing to restart` })
      return
    }
    const coordinator = await actor("coordinator")
    await openTrackedReview(coordinator, subject)
    await restartFromReview(coordinator, subject, "Reinicio para repetir la prueba de punta a punta")
    await teacher.reload()
    await expect(item).toContainText(/Sin iniciar|Borrador/)
  })

  test("teacher fills every field type, autosaves and submits with a signature", async ({ actor }) => {
    const page = await actor("teacher")
    const health = watchPage(page)
    trackAutosave(page)
    await openTeacherSyllabus(page, subject)

    const stamp = String(Date.now())
    const description = `Se adaptan materiales con letra ampliada (${stamp})`
    await fillIdentification(page, description)
    await fillPlanning(page)
    await fillRichText(page)
    await fillOutcomes(page)
    const { catalogTitle } = await fillBibliography(page, stamp)
    test.info().annotations.push({ type: "koha", description: catalogTitle ? `catalog result added: ${catalogTitle}` : "catalog unreachable, filled manually" })

    await page.reload()
    await openSection(page, "1. Identificación institucional")
    await expect(page.getByRole("textbox", { name: "Breve descripción (obligatorio)" })).toHaveValue(description)

    await expect(page.getByRole("button", { name: "Firmar y enviar" })).toBeVisible()
    await submitSyllabus(page, accounts.teacher)
    health.expectClean()
  })

  test("librarian reviews the bibliography and returns it once with a comment", async ({ actor }) => {
    const page = await actor("librarian")
    const health = watchPage(page)
    await page.goto("/biblioteca/revisiones")
    await page.getByRole("row", { name: `Abrir revisión de ${subject}` }).click()
    await expect(page.getByRole("heading", { level: 1, name: subject })).toBeVisible()
    await expect(page.getByRole("article", { name: "Bibliografía" })).toContainText("Ecuaciones diferenciales")
    await page.getByRole("button", { name: "Devolver al docente" }).click()
    const dialog = page.getByRole("dialog", { name: "Devolver al docente" })
    const reasons = dialog.getByRole("group", { name: "Motivos de la devolución" }).getByRole("checkbox")
    await reasons.first().check()
    await dialog.getByRole("button", { name: "Devolver al docente" }).click()
    await expect(dialog).toBeHidden()
    await expect(page.locator("[data-sonner-toast]").first()).toBeVisible()
    health.expectClean()
  })

  test("teacher fixes the returned syllabus and resubmits", async ({ actor }) => {
    const page = await actor("teacher")
    const health = watchPage(page)
    trackAutosave(page)
    await openTeacherSyllabus(page, subject)
    await expect(page.getByText("Corrección solicitada").first()).toBeVisible()
    await expect(page.getByText("Biblioteca").first()).toBeVisible()
    await openSection(page, /^11\. Bibliografía/)
    const complementary = page.getByRole("group", { name: "Complementaria", exact: true }).getByRole("region", { name: "Libro" })
    await complementary.getByRole("textbox", { name: "Título, libro 1" }).fill(`Ecuaciones diferenciales, 2.ª edición ${Date.now()}`)
    await settleAutosave(page)
    await submitSyllabus(page, accounts.teacher)
    health.expectClean()
  })

  test("librarian verifies the bibliography with a signature", async ({ actor }) => {
    const page = await actor("librarian")
    const health = watchPage(page)
    await page.goto("/biblioteca/revisiones")
    await page.getByRole("row", { name: `Abrir revisión de ${subject}` }).click()
    await expect(page.getByRole("article", { name: "Bibliografía" })).toContainText("2.ª edición")
    await page.getByRole("button", { name: "Firmar y enviar a coordinación" }).click()
    await signWith(page, "Firmar y enviar a coordinación", accounts.librarian, "Firmar y enviar")
    await expect(page.locator("[data-sonner-toast]").first()).toBeVisible()
    health.expectClean()
  })

  test("coordinator requests a correction once", async ({ actor }) => {
    const page = await actor("coordinator")
    const health = watchPage(page)
    await openCoordinationReview(page, subject)
    await expect(page.getByRole("region", { name: "Vista previa del sílabo" })).toContainText("Baja visión")
    await page.getByRole("button", { name: "Solicitar corrección" }).click()
    const dialog = page.getByRole("dialog", { name: "Solicitar corrección" })
    await dialog.getByLabel("Comentario para el docente").fill("Revise los resultados de aprendizaje de la unidad 2")
    await dialog.getByRole("button", { name: "Solicitar corrección" }).click()
    await expect(dialog).toBeHidden()
    await expect(page.locator("[data-sonner-toast]").first()).toBeVisible()
    health.expectClean()
  })

  test("teacher addresses the coordinator correction and resubmits", async ({ actor }) => {
    const page = await actor("teacher")
    const health = watchPage(page)
    trackAutosave(page)
    await openTeacherSyllabus(page, subject)
    await expect(page.getByText("Revise los resultados de aprendizaje de la unidad 2")).toBeVisible()
    await openSection(page, /^6\. Distribución/)
    const unit = page.getByRole("button", { name: /^Unidad 2\b/ })
    if ((await unit.getAttribute("aria-expanded")) !== "true") await unit.click()
    await page
      .getByRole("region", { name: /^Unidad 2\b/ })
      .getByRole("textbox", { name: "Resultados de aprendizaje (obligatorio)" })
      .fill(`Aplica derivadas parciales a problemas de optimización (${Date.now()})`)
    await settleAutosave(page)
    await submitSyllabus(page, accounts.teacher)
    health.expectClean()
  })

  test("coordinator approves with a signature", async ({ actor }) => {
    const librarian = await actor("librarian")
    await librarian.goto("/biblioteca/revisiones")
    const pending = librarian.getByRole("row", { name: `Abrir revisión de ${subject}` })
    if (await pending.filter({ hasText: "En revisión" }).isVisible()) {
      await pending.click()
      await librarian.getByRole("button", { name: "Firmar y enviar a coordinación" }).click()
      await signWith(librarian, "Firmar y enviar a coordinación", accounts.librarian, "Firmar y enviar")
    }

    const page = await actor("coordinator")
    const health = watchPage(page)
    await openCoordinationReview(page, subject)
    await page.getByRole("button", { name: "Comparar con la versión anterior" }).click()
    await expect(page.getByRole("region", { name: "Versión anterior" })).toBeVisible()
    await expect(page.getByRole("region", { name: "Versión actual" })).toBeVisible()
    await page.getByRole("button", { name: "Firmar y aprobar" }).click()
    await signWith(page, "Firmar y aprobar", accounts.coordinator, "Firmar y aprobar")
    await expect(page.locator("[data-sonner-toast]").first()).toBeVisible()
    health.expectClean()
  })

  test("worker generates the PDF and the coordinator downloads it with three signature stamps", async ({ actor }) => {
    const page = await actor("coordinator")
    const health = watchPage(page)
    await openTrackedReview(page, subject)
    const reviewPath = new URL(page.url()).pathname
    await page.goto(`${reviewPath}/documentos`)
    await expect(page.getByRole("heading", { level: 1, name: "PDF del sílabo" })).toBeVisible()
    const download = page.waitForEvent("download")
    await expect(page.getByRole("button", { name: "Descargar PDF" })).toBeEnabled({ timeout: 60_000 })
    await page.getByRole("button", { name: "Descargar PDF" }).click()
    const file = path.join(test.info().outputDir, "approved.pdf")
    await (await download).saveAs(file)
    expect(fs.readFileSync(file).subarray(0, 5).toString()).toBe("%PDF-")
    const text = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" })
    test.info().annotations.push({ type: "pdf-stamps", description: String(stampCount(text)) })
    expect(stampCount(text)).toBe(3)

    const popup = page.waitForEvent("popup")
    await page.getByRole("button", { name: "Ver PDF" }).click()
    await expect.poll(async () => (await popup).url()).toMatch(/^blob:/)
    health.expectClean()
  })

  test("coordinator browses the version history", async ({ actor }) => {
    const page = await actor("coordinator")
    const health = watchPage(page)
    await openTrackedReview(page, subject)
    await page.getByRole("link", { name: "Historial" }).click()
    await expect(page).toHaveURL(/\/historial$/)
    const versions = page.getByRole("complementary", { name: "Historial de versiones" })
    await expect(versions.getByRole("button", { name: /^Versión 3 · Aprobada/ })).toBeVisible()
    await expect(versions).toContainText("Biblioteca devolvió al docente")
    await expect(versions).toContainText("Revise los resultados de aprendizaje de la unidad 2")
    const highlight = page.getByRole("button", { name: "Resaltar cambios" })
    await expect(highlight).toHaveAttribute("aria-pressed", "true")
    await highlight.click()
    await expect(highlight).toHaveAttribute("aria-pressed", "false")
    await versions.getByRole("button", { name: /^Versión 1 · Primer envío/ }).click()
    await expect(page.getByText(/^Cálculo III\s*Versión 1/)).toBeVisible()
    await page.getByRole("link", { name: "Volver al sílabo" }).click()
    await expect(page.getByRole("heading", { level: 1, name: subject })).toBeVisible()
    health.expectClean()
  })

  test("teacher and librarian open the approved PDF and their documents pages", async ({ actor }) => {
    const teacher = await actor("teacher")
    const teacherHealth = watchPage(teacher)
    await openTeacherSyllabus(teacher, subject)
    await expect(teacher.getByText("Aprobado").first()).toBeVisible()
    const popup = teacher.waitForEvent("popup")
    await teacher.getByRole("button", { name: "Ver PDF" }).click()
    await expect.poll(async () => (await popup).url()).toMatch(/^blob:/)
    const revision = await approvedRevisionOf(teacher)
    await teacher.goto(`/docente/revisiones/${revision}/documentos`)
    await expect(teacher.getByRole("heading", { level: 1, name: "PDF del sílabo" })).toBeVisible()
    await expect(teacher.getByRole("button", { name: "Descargar PDF" })).toBeEnabled()
    await teacher.goto(`/revisiones/${revision}/documentos`)
    await expect(teacher).toHaveURL(new RegExp(`/docente/revisiones/${revision}/documentos$`))
    await teacher.goto("/docente/historial")
    await expect(teacher.getByRole("heading", { level: 1, name: "Historial" })).toBeVisible()
    teacherHealth.expectClean()

    const librarian = await actor("librarian")
    const librarianHealth = watchPage(librarian)
    await librarian.goto("/biblioteca/historial")
    await expect(librarian.getByRole("heading", { level: 1, name: "Historial" })).toBeVisible()
    await librarian.goto("/biblioteca/revisiones")
    await librarian.getByRole("combobox", { name: "Estado" }).click()
    await librarian.getByRole("option", { name: "Aprobados" }).click()
    await librarian.getByRole("row", { name: `Abrir revisión de ${subject}` }).click()
    await expect(librarian.getByRole("heading", { level: 1, name: subject })).toBeVisible()
    await librarian.goto(`/revisiones/${revision}/documentos`)
    await expect(librarian).toHaveURL(new RegExp(`/biblioteca/revisiones/${revision}$`))
    await expect(librarian.getByRole("heading", { level: 1, name: subject })).toBeVisible()
    const libraryPdf = librarian.waitForEvent("popup")
    await librarian.getByRole("button", { name: "Ver PDF" }).click()
    await expect.poll(async () => (await libraryPdf).url()).toMatch(/^blob:/)
    librarianHealth.expectClean()
  })

  test("teacher copies a new parallel from parallel A and submits it", async ({ actor }) => {
    const page = await actor("teacher")
    const health = watchPage(page)
    const coordinator = await actor("coordinator")
    const sizes = new Map(mailLogPaths.map((file) => [file, fs.existsSync(file) ? fs.statSync(file).size : 0]))
    const code = await addTeacherParallel(coordinator, subject, await userName(accounts.teacher.email))
    const notice = `Ya puede elaborar el sílabo de ${subject}, paralelo ${code}.`
    const newMail = () =>
      mailLogPaths
        .map((file) => (fs.existsSync(file) ? fs.readFileSync(file).subarray(sizes.get(file) ?? 0).toString("latin1") : ""))
        .map((raw) => Buffer.from(raw.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))), "latin1").toString("utf8"))
        .join("\n")
    await expect.poll(() => { const mail = newMail(); return mail.includes(`To: ${accounts.teacher.email}`) && mail.includes(notice) }, { timeout: 30_000 }).toBe(true)
    await page.goto("/docente/notificaciones")
    await page.getByRole("navigation", { name: "Filtrar notificaciones" }).getByRole("button", { name: "Todas" }).click()
    await expect(page.getByRole("main").getByRole("article").filter({ hasText: "Tiene un sílabo nuevo" }).filter({ hasText: notice.slice(0, -1) })).toHaveCount(1)
    await page.goto("/docente/mis-silabos")
    const target = page
      .getByRole("list", { name: "Mis sílabos" })
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: subject, exact: true }) })
      .filter({ has: page.getByText(`Paralelo: ${code}`, { exact: true }) })
    await expect(teacherListItem(page, subject)).toBeVisible()
    await expect(target).toHaveCount(1)
    await expect(target).toContainText("Sin iniciar")
    await target.getByRole("heading", { name: subject, exact: true }).click()
    await page.getByRole("button", { name: "Copiar desde paralelo A" }).click()
    const dialog = page.getByRole("dialog", { name: "¿Copiar desde el paralelo A?" })
    await dialog.getByRole("button", { name: "Copiar contenido" }).click()
    await expect(dialog).toBeHidden()
    await openSection(page, "1. Identificación institucional")
    await expect(page.getByRole("textbox", { name: "Breve descripción (obligatorio)" })).toHaveValue(/Se adaptan materiales con letra ampliada/)
    await submitSyllabus(page, accounts.teacher)
    health.expectClean()
  })

  test("coordinator approves the copied parallel and then restarts it", async ({ actor }) => {
    const librarian = await actor("librarian")
    await librarian.goto("/biblioteca/revisiones")
    await expect(librarian.getByRole("table", { name: "Revisiones de biblioteca" })).toBeVisible()
    const libraryRow = librarian.getByRole("row", { name: `Abrir revisión de ${subject}` }).filter({ hasText: "En revisión" }).first()
    if (await libraryRow.isVisible()) {
      await libraryRow.click()
      await librarian.getByRole("button", { name: "Firmar y enviar a coordinación" }).click()
      await signWith(librarian, "Firmar y enviar a coordinación", accounts.librarian, "Firmar y enviar")
    }

    const page = await actor("coordinator")
    const health = watchPage(page)
    await page.goto("/coordinacion/revisiones")
    const queue = page.getByRole("table", { name: "Revisiones de coordinación" })
    await expect(queue).toBeVisible()
    const queued = queue.getByRole("row", { name: `Abrir revisión de ${subject}` }).first()
    if (await queued.isVisible()) {
      await queued.click()
      await page.getByRole("button", { name: "Firmar y aprobar" }).click()
      await signWith(page, "Firmar y aprobar", accounts.coordinator, "Firmar y aprobar")
    }

    await page.goto("/coordinacion/revisiones?tab=seguimiento")
    await page
      .getByRole("table", { name: "Seguimiento de la convocatoria" })
      .getByRole("row", { name: `Abrir revisión de ${subject}` })
      .filter({ hasNot: page.getByText("Paralelo A", { exact: true }) })
      .filter({ hasText: "Aprobado" })
      .first()
      .click()
    await expect(page.getByRole("heading", { level: 1, name: subject })).toBeVisible()
    await page.getByRole("button", { name: "Más" }).click()
    await page.getByRole("menuitem", { name: "Reiniciar sílabo" }).click()
    const dialog = page.getByRole("dialog", { name: `Reiniciar «${subject}»` })
    await expect(dialog).toContainText("la aprobación y el PDF")
    const confirm = dialog.getByRole("button", { name: /Reiniciar/ }).last()
    await dialog.locator("#restart-reason").fill("El paralelo necesita su propia planificación")
    await expect(confirm).toBeDisabled()
    await dialog.locator("#restart-name").fill(subject)
    const reset = page.waitForResponse((response) => /\/reset$/.test(response.url()) && response.request().method() === "POST")
    await confirm.click()
    expect((await reset).status()).toBe(200)
    await expect(dialog).toBeHidden()
    await expect(page.locator("[data-sonner-toast]").first()).toBeVisible()

    const teacher = await actor("teacher")
    await teacher.goto("/docente/mis-silabos")
    await expect(
      teacher
        .getByRole("list", { name: "Mis sílabos" })
        .getByRole("listitem")
        .filter({ has: teacher.getByRole("heading", { name: subject, exact: true }) })
        .filter({ hasNot: teacher.getByText("Paralelo: A", { exact: true }) })
        .first(),
    ).toContainText(/Sin iniciar|Borrador/)
    health.expectClean()
  })
})
