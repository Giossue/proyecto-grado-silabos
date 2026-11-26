import fs from "node:fs"
import type { Locator, Page, Route } from "@playwright/test"
import { storageStateOf } from "./support/accounts"
import { query, snapshotDatabase } from "./support/db"
import { expect, test } from "./support/fixtures"
import { rowNamed, toast } from "./support/ui"

test.use({ storageState: storageStateOf("admin") })

type TemplateState = { definition: unknown; sections: unknown[]; fields: unknown[] }

async function templateState(): Promise<TemplateState> {
  const [template] = await query<{ definition: unknown }>("select definicion_plantilla as definition from plantilla_silabo")
  const sections = await query(
    `select clave_seccion_plantilla as key, titulo_seccion_plantilla as title, posicion_seccion_plantilla as position, orientacion_seccion_plantilla as orientation
       from secciones_plantilla where vigente_en_plantilla order by posicion_seccion_plantilla, clave_seccion_plantilla`,
  )
  const fields = await query(
    `select s.clave_seccion_plantilla as section, c.clave_campo_plantilla as key, c.titulo_campo_plantilla as label, c.posicion_campo_plantilla as position,
            d.quien_llena_definicion_campo as responsible, d.contenido_definicion_campo as content
       from campos_plantilla c
       join secciones_plantilla s on s.seccion_plantilla_id = c.seccion_plantilla_id
       join definiciones_campo d on d.campo_plantilla_id = c.campo_plantilla_id and d.vigente_en_plantilla
      where c.vigente_en_plantilla order by s.posicion_seccion_plantilla, c.posicion_campo_plantilla, c.clave_campo_plantilla`,
  )
  return { definition: template!.definition, sections, fields }
}

async function convocationState(): Promise<string | undefined> {
  const [row] = await query<{ state: string }>(
    "select estado_convocatoria_universidad as state from convocatorias_universidad where finalizada_en is null order by fecha_inicio desc limit 1",
  )
  return row?.state
}

async function convocationOption(page: Page, action: RegExp): Promise<void> {
  await page.goto("/admin/periodos")
  await rowNamed(page, /\S/, "button").first().getByRole("button").click()
  await page.getByRole("dialog", { name: /^Periodo académico / }).getByRole("button", { name: action }).click()
}

async function enterEditMode(page: Page): Promise<void> {
  await page.goto("/admin/plantilla")
  await page.getByRole("button", { name: "Editar", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "Editar la plantilla" })).toHaveCount(0)
  await expect(page.getByRole("toolbar", { name: "Cinta de edición de la plantilla" })).toBeVisible()
}

async function openJsonDialog(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Opciones avanzadas" }).click()
  await page.getByRole("menuitem", { name: "Editar JSON" }).click()
  const dialog = page.getByRole("dialog", { name: "Plantilla como JSON" })
  await expect(dialog.getByRole("textbox", { name: "JSON de la plantilla" })).not.toHaveValue("")
  return dialog
}

const sectionNamed = (page: Page, title: string): Locator =>
  page.locator("section[data-section]").filter({ has: page.getByRole("textbox", { name: `Sección ${title}`, exact: true }) })

const fieldNamesIn = (section: Locator): Promise<string[]> =>
  section.locator("li[data-field]").evaluateAll((items) => items.map((item) => (item.querySelector("[data-field-label] textarea") as HTMLTextAreaElement | null)?.value ?? ""))

async function nameSelectedField(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Si se puede editar el campo Campo sin nombre" }).click()
  await page.getByRole("menuitem", { name: "Ponerle nombre" }).click()
  await expect(page.getByRole("textbox", { name: "Nombre del campo Campo sin nombre" })).toBeFocused()
  await page.keyboard.type(name)
  await page.keyboard.press("Enter")
}

async function sectionOrder(page: Page): Promise<string[]> {
  return page.locator("[data-section-title] textarea").evaluateAll((items) => items.map((item) => (item as HTMLTextAreaElement).value))
}

async function pickDate(page: Page, trigger: string, date: Date): Promise<void> {
  await page.locator(`#${trigger}`).click()
  const month = new Intl.DateTimeFormat("es-EC", { month: "long", timeZone: "UTC" }).format(date)
  const target = page.getByRole("grid").last().getByRole("button", { name: new RegExp(`\\b${date.getUTCDate()} de ${month} de ${date.getUTCFullYear()}\\b`, "i") })
  for (let step = 0; step < 14 && !(await target.isVisible()); step += 1) await page.getByRole("button", { name: "Mes siguiente" }).click()
  await target.click()
  await expect(page.getByRole("grid")).toHaveCount(0)
}

type AssistantMock = { requests: string[]; applied: boolean; sent: { message: string; draft: { key: string; title: string }[]; draft_version: string } | null }

async function mockAssistant(page: Page): Promise<AssistantMock> {
  const mock: AssistantMock = { requests: [], applied: false, sent: null }
  const now = new Date().toISOString()
  const chat = () => ({
    available: true,
    locked: false,
    suggestions: [],
    messages: mock.sent
      ? [
          { id: "e2e-user", role: "usuario", status: "completado", result: null, content: mock.sent.message, error: null, created_at: now, proposal: null },
          {
            id: "e2e-assistant",
            role: "asistente",
            status: "completado",
            result: "propuesta",
            content: "Propongo cambiar el título de la sección",
            error: null,
            created_at: now,
            proposal: { id: "e2e-proposal", status: mock.applied ? "aplicada" : "pendiente", changes: ["Sección «Prueba E2E»: nuevo título"], draft_version: mock.sent.draft_version },
          },
        ]
      : [],
  })
  const proposal = () => {
    const sections = mock.sent!.draft.map((section) => (section.title === "Prueba E2E" ? { ...section, title: "Prueba E2E asistente" } : section))
    const changed = sections.filter((section) => section.title === "Prueba E2E asistente").map((section) => section.key)
    return { id: "e2e-proposal", status: "pendiente", draft_version: mock.sent!.draft_version, changes: ["Sección «Prueba E2E»: nuevo título"], changed: { sections: changed, fields: [] }, sections }
  }
  await page.route("**/api/v1/admin/template/assistant**", async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    mock.requests.push(`${request.method()} ${url.pathname}`)
    if (request.method() === "POST" && url.pathname.endsWith("/assistant/messages")) {
      mock.sent = request.postDataJSON() as AssistantMock["sent"]
      return route.fulfill({ status: 202, json: { message: "Pedido recibido", assistant_message_id: "e2e-assistant" } })
    }
    if (request.method() === "GET" && url.pathname.endsWith("/proposals/e2e-proposal")) return route.fulfill({ json: proposal() })
    if (request.method() === "POST" && url.pathname.endsWith("/proposals/e2e-proposal/apply")) {
      mock.applied = true
      return route.fulfill({ json: { message: "Propuesta aplicada" } })
    }
    if (request.method() === "GET" && url.pathname.endsWith("/assistant")) return route.fulfill({ json: chat() })
    return route.fulfill({ status: 500, json: { message: `Unexpected ${request.method()} ${url.pathname}` } })
  })
  return mock
}

test.describe.serial("template editing during a paused convocation", () => {
  let before: TemplateState
  let originalJson = ""
  let aiMessagesBefore = 0

  test.beforeAll(async () => {
    before = await templateState()
    const [count] = await query<{ total: string }>("select count(*) as total from mensajes_ia_plantilla")
    aiMessagesBefore = Number(count!.total)
  })

  test("the editor stays locked while the convocation is open and unlocks once the admin pauses it", async ({ page, issues }) => {
    expect(await convocationState()).toBe("abierto")
    await page.goto("/admin/plantilla")
    await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeDisabled()

    await convocationOption(page, /^Pausar/)
    await expect(rowNamed(page, /\S/, "button").first()).toContainText(/Pausad/)
    expect(await convocationState()).toBe("pausado")

    await page.goto("/admin/plantilla")
    await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeEnabled()
    await expect(page.getByRole("button", { name: "¿Por qué?" })).toHaveCount(0)
    issues.expectClean()
  })

  test("admin edits sections and fields, formats, designs a table, previews, uses the assistant and saves", async ({ page, issues }, testInfo) => {
    const assistant = await mockAssistant(page)
    await enterEditMode(page)

    const json = await openJsonDialog(page)
    originalJson = await json.getByRole("textbox", { name: "JSON de la plantilla" }).inputValue()
    const downloading = page.waitForEvent("download")
    await json.getByRole("button", { name: "Descargar" }).click()
    const download = await downloading
    expect(download.suggestedFilename()).toBe("plantilla-silabo.json")
    const exported = testInfo.outputPath("plantilla-silabo.json")
    await download.saveAs(exported)
    expect(JSON.parse(fs.readFileSync(exported, "utf8"))).toEqual(JSON.parse(originalJson))
    expect((JSON.parse(originalJson) as { sections: unknown[] }).sections.length).toBeGreaterThan(0)
    await json.getByRole("button", { name: "Cancelar" }).click()
    await expect(json).toBeHidden()

    const bibliography = sectionNamed(page, "11. Bibliografía")
    await bibliography.getByRole("button", { name: "Nueva sección" }).last().click()
    const created = page.getByRole("textbox", { name: "Sección Nueva sección", exact: true })
    await expect(created).toBeFocused()
    await created.fill("Prueba E2E")
    const section = sectionNamed(page, "Prueba E2E")
    await expect(section).toContainText("Sección sin campos.")
    const order = await sectionOrder(page)
    expect(order[order.indexOf("11. Bibliografía") + 1]).toBe("Prueba E2E")

    await section.getByRole("button", { name: "Agregar campo" }).click()
    await page.keyboard.type("Contenido del campo A")
    await nameSelectedField(page, "Campo A")
    await expect(section.getByRole("textbox", { name: "Nombre del campo Campo A" })).toHaveValue("Campo A")

    const contentA = section.getByRole("textbox", { name: "Contenido de Campo A" })
    await contentA.click()
    await page.keyboard.press("ControlOrMeta+a")
    await page.getByRole("button", { name: "Negrita" }).click()
    await page.getByRole("button", { name: "Centrar" }).click()
    await expect(contentA.locator("strong")).toHaveText("Contenido del campo A")
    await expect(contentA.locator("p").first()).toHaveCSS("text-align", "center")

    await section.locator("li[data-field]").last().getByRole("button", { name: "Agregar campo" }).last().click()
    await page.keyboard.type("Contenido del campo B")
    await nameSelectedField(page, "Campo B")
    expect(await fieldNamesIn(section)).toEqual(["Campo A", "Campo B"])

    await section.getByRole("button", { name: "Arrastrar el campo Campo B" }).click()
    await page.getByRole("button", { name: "Subir el campo Campo B" }).click()
    expect(await fieldNamesIn(section)).toEqual(["Campo B", "Campo A"])
    await page.getByRole("button", { name: "Bajar el campo Campo B" }).click()
    expect(await fieldNamesIn(section)).toEqual(["Campo A", "Campo B"])

    await section.getByRole("button", { name: "Arrastrar la sección Prueba E2E" }).click()
    await page.getByRole("button", { name: "Subir la sección Prueba E2E" }).click()
    let sections = await sectionOrder(page)
    expect(sections.indexOf("Prueba E2E")).toBe(sections.indexOf("11. Bibliografía") - 1)
    await page.getByRole("button", { name: "Bajar la sección Prueba E2E" }).click()
    sections = await sectionOrder(page)
    expect(sections.indexOf("Prueba E2E")).toBe(sections.indexOf("11. Bibliografía") + 1)

    await page.getByRole("button", { name: "Deshacer" }).click()
    sections = await sectionOrder(page)
    expect(sections.indexOf("Prueba E2E")).toBe(sections.indexOf("11. Bibliografía") - 1)
    await page.getByRole("button", { name: "Rehacer" }).click()
    sections = await sectionOrder(page)
    expect(sections.indexOf("Prueba E2E")).toBe(sections.indexOf("11. Bibliografía") + 1)

    await section.getByRole("button", { name: "Arrastrar el campo Campo A" }).click()
    await page.getByRole("button", { name: "Tabla repetible" }).click()
    await page.getByRole("menuitem", { name: "Nueva tabla repetible" }).click()
    const designer = page.getByRole("dialog", { name: "Nueva tabla repetible" })
    await designer.getByLabel("Título de la tabla").fill("Prácticas E2E")
    await designer.getByLabel("Cada fila se llama").fill("práctica")
    await designer.getByRole("region", { name: "Columnas" }).getByLabel("Nombre", { exact: true }).first().fill("Actividad")
    const designed = page.waitForResponse((response) => /\/admin\/template\/[^/]+\/blocks\/design$/.test(response.url()))
    await designer.getByRole("button", { name: "Insertar tabla" }).click()
    expect((await designed).ok()).toBe(true)
    await expect(designer).toBeHidden()
    await expect(section.locator("li[data-field]").first().getByRole("table")).toContainText("Actividad")
    await page.getByRole("button", { name: "Tabla repetible" }).click()
    await expect(page.getByRole("menuitem", { name: "Editar «Prácticas E2E»" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu")).toBeHidden()

    await page.getByRole("button", { name: "Opciones avanzadas" }).click()
    await page.getByRole("menuitem", { name: "Diseño" }).click()
    const layout = page.getByRole("dialog", { name: "Diseño" })
    await layout.getByRole("combobox", { name: "Márgenes" }).click()
    await page.getByRole("option", { name: "2,0 cm" }).click()
    await expect(layout.getByRole("combobox", { name: "Márgenes" })).toHaveText("2,0 cm")
    await layout.getByRole("button", { name: "Cerrar" }).last().click()
    await expect(layout).toBeHidden()

    await section.getByRole("button", { name: "Arrastrar el campo Campo B" }).click()
    await page.getByRole("button", { name: "Eliminar el campo Campo B" }).click()
    const removal = page.getByRole("dialog", { name: "Eliminar campo" })
    await expect(removal).toContainText("Se quitará «Campo B» de la plantilla")
    await removal.getByRole("button", { name: "Eliminar" }).click()
    await expect(removal).toBeHidden()
    expect(await fieldNamesIn(section)).toEqual(["Campo A"])

    await page.getByRole("button", { name: "Vista previa" }).click()
    await expect(page.locator("article[data-preview='true']").first()).toBeVisible()
    await expect(page.locator("[data-section-title]").filter({ hasText: "Prueba E2E" })).toBeVisible()
    await expect(page.getByRole("textbox", { name: "Sección Prueba E2E" })).toHaveCount(0)
    await page.getByRole("button", { name: "Volver a editar" }).click()
    await expect(page.getByRole("textbox", { name: "Sección Prueba E2E" })).toBeVisible()

    const teacherView = page.getByRole("button", { name: "Ver como docente" })
    await teacherView.click()
    await expect(teacherView).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByText("Vista de prueba del borrador sin guardar: así verá el formulario el docente. Lo que escriba aquí no se guarda")).toBeVisible()
    await expect(page.getByRole("tab", { name: "Prueba E2E" })).toBeVisible()
    await teacherView.click()
    await expect(teacherView).toHaveAttribute("aria-pressed", "false")
    await expect(page.getByRole("textbox", { name: "Sección Prueba E2E" })).toBeVisible()

    await page.getByRole("button", { name: "Asistente", exact: true }).click()
    const panel = page.getByRole("complementary", { name: "Asistente de plantilla" })
    await expect(panel.getByText("Pida un cambio a la plantilla")).toBeVisible()
    await panel.getByRole("textbox", { name: "Pedido al asistente" }).fill("Cambie el título de la sección Prueba E2E")
    await panel.getByRole("button", { name: "Enviar" }).click()
    await expect(panel.getByText("Cambie el título de la sección Prueba E2E")).toBeVisible()
    expect(assistant.sent?.draft.some((item) => item.title === "Prueba E2E")).toBe(true)
    await expect(panel.getByText("Cambios propuestos")).toBeVisible()
    await panel.getByRole("button", { name: "Aplicar" }).click()
    await expect(toast(page, "Cambios aplicados. Guárdelos con «Guardar»")).toBeVisible()
    await expect(page.getByRole("textbox", { name: "Sección Prueba E2E asistente", exact: true })).toBeVisible()
    await expect(sectionNamed(page, "Prueba E2E asistente").locator("[data-change-mark]")).toHaveText("Cambió")
    await expect(panel.getByText("Aplicada")).toBeVisible()
    await page.getByRole("button", { name: "Cerrar asistente" }).click()
    await expect(panel).toBeHidden()
    expect(assistant.requests).toEqual(expect.arrayContaining(["POST /api/v1/admin/template/assistant/messages", "POST /api/v1/admin/template/assistant/proposals/e2e-proposal/apply"]))

    const saved = page.waitForResponse((response) => /\/admin\/template\/[^/]+\/json$/.test(response.url()) && response.request().method() === "PUT")
    await page.getByRole("button", { name: "Guardar", exact: true }).click()
    const impact = page.getByRole("dialog", { name: "Sílabos afectados" })
    await expect(impact).toContainText("Al reanudar el periodo académico en pausa:")
    await expect(impact.locator("[data-impact-lines]")).toContainText("conserva")
    await impact.getByRole("button", { name: "Guardar", exact: true }).click()
    expect((await saved).ok()).toBe(true)
    await expect(toast(page, "Plantilla guardada")).toBeVisible()

    const stored = await query<{ title: string; label: string; content: string }>(
      `select s.titulo_seccion_plantilla as title, c.titulo_campo_plantilla as label, d.contenido_definicion_campo::text as content
         from secciones_plantilla s join campos_plantilla c on c.seccion_plantilla_id = s.seccion_plantilla_id and c.vigente_en_plantilla
         join definiciones_campo d on d.campo_plantilla_id = c.campo_plantilla_id and d.vigente_en_plantilla
        where s.vigente_en_plantilla and s.titulo_seccion_plantilla like 'Prueba E2E%'`,
    )
    expect(stored.map((row) => [row.title, row.label])).toEqual([["Prueba E2E asistente", "Campo A"]])
    expect(stored[0]!.content).toContain("documentBlock")
    const [definition] = await query<{ margin: string; blocks: string }>("select definicion_plantilla->'document'->>'margin_cm' as margin, (definicion_plantilla->'blocks')::text as blocks from plantilla_silabo")
    expect(definition!.margin).toMatch(/^2(\.0)?$/)
    expect(definition!.blocks).toContain("Prácticas E2E")

    await page.goto("/admin/plantilla")
    await expect(page.getByText("Plantilla modificada durante la pausa")).toBeVisible()
    issues.expectClean()
  })

  test("admin restores the original template by importing the exported JSON", async ({ page, issues }, testInfo) => {
    fs.mkdirSync(testInfo.outputDir, { recursive: true })
    const file = testInfo.outputPath("plantilla-original.json")
    fs.writeFileSync(file, originalJson)

    await enterEditMode(page)
    const json = await openJsonDialog(page)
    await json.getByLabel("Archivo JSON de la plantilla").setInputFiles(file)
    await expect(json.getByRole("textbox", { name: "JSON de la plantilla" })).toHaveValue(originalJson)
    const imported = page.waitForResponse((response) => /\/admin\/template\/[^/]+\/json$/.test(response.url()) && response.request().method() === "PUT")
    await json.getByRole("button", { name: "Aplicar y reemplazar" }).click()
    expect((await imported).ok()).toBe(true)
    await expect(json).toBeHidden()
    await expect(toast(page, "Plantilla actualizada desde el JSON")).toBeVisible()
    await expect(page.getByRole("toolbar", { name: "Cinta de edición de la plantilla" })).toBeHidden()
    await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeEnabled()
    await expect(page.getByRole("heading", { name: "11. Bibliografía" })).toBeVisible()
    await expect(page.getByRole("heading", { name: /^Prueba E2E/ })).toHaveCount(0)
    expect(await templateState()).toEqual(before)
    issues.expectClean()
  })

  test("admin resumes the convocation and confirms that syllabi adapt to the template", async ({ page, issues }) => {
    const resumed = page.waitForResponse((response) => /\/reanudar$/.test(response.url()) && response.request().postData()?.includes("confirmar_rehacer") === true)
    await convocationOption(page, /^Reanudar/)
    expect((await resumed).status()).toBe(200)
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(rowNamed(page, /\S/, "button").first()).toContainText(/Abiert/)
    expect(await convocationState()).toBe("abierto")

    await page.goto("/admin/plantilla")
    await expect(page.getByRole("button", { name: "Editar", exact: true })).toBeDisabled()
    await expect(page.getByText("Plantilla modificada durante la pausa")).toHaveCount(0)
    expect(await templateState()).toEqual(before)
    issues.expectClean([/^http 422: POST .*\/admin\/processes\/[^/]+\/reanudar$/, /^console: Failed to load resource: the server responded with a status of 422 .* @ .*\/admin\/periodos$/])
  })

  test("admin finalizes the convocation and opens a new period with its convocation", async ({ page, issues }) => {
    const snapshot = snapshotDatabase("before-new-period")
    try {
      await page.goto("/admin/periodos")
      await expect(page.getByRole("button", { name: "Nuevo periodo académico" })).toBeDisabled()
      await convocationOption(page, /^Finalizar/)
      await expect(rowNamed(page, /\S/, "button").first()).toContainText(/Finalizad/)
      expect(await convocationState()).toBeUndefined()

      const periodsBefore = await query<{ code: string }>("select codigo_periodo_academico as code from periodos_academicos")
      await page.getByRole("button", { name: "Nuevo periodo académico" }).click()
      const dialog = page.getByRole("dialog", { name: "Nuevo periodo académico" })
      await pickDate(page, "convocation-period-starts", new Date(Date.UTC(2027, 3, 5)))
      await pickDate(page, "convocation-period-ends", new Date(Date.UTC(2027, 7, 27)))
      await dialog.getByRole("button", { name: "Siguiente" }).click()
      await pickDate(page, "convocation-starts", new Date(Date.UTC(2027, 2, 22)))
      await pickDate(page, "convocation-due", new Date(Date.UTC(2027, 3, 12)))
      await dialog.getByRole("button", { name: "Abrir periodo académico" }).click()
      await expect(toast(page, "Periodo académico abierto. Cada coordinación ya puede abrir el de su carrera")).toBeVisible()
      await expect(page.getByRole("dialog")).toHaveCount(0)

      const periods = await query<{ code: string; starts: string; ends: string; state: string }>(
        `select p.codigo_periodo_academico as code, p.fecha_inicio_periodo::text as starts, p.fecha_fin_periodo::text as ends, c.estado_convocatoria_universidad as state
           from periodos_academicos p join convocatorias_universidad c on c.periodo_academico_id = p.periodo_academico_id
          where p.fecha_inicio_periodo = '2027-04-05'`,
      )
      expect(periods).toHaveLength(1)
      expect(periods[0]).toMatchObject({ starts: "2027-04-05", ends: "2027-08-27", state: "abierto" })
      expect(periodsBefore.map((period) => period.code)).not.toContain(periods[0]!.code)
      await expect(rowNamed(page, periods[0]!.code, "button")).toBeVisible()
      expect(await templateState()).toEqual(before)
      issues.expectClean()
    } finally {
      snapshot.restore()
    }
  })

  test("the template assistant never reached the server", async () => {
    const [count] = await query<{ total: string }>("select count(*) as total from mensajes_ia_plantilla")
    expect(Number(count!.total)).toBe(aiMessagesBefore)
  })
})
