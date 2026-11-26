import path from "node:path"
import type { Page } from "@playwright/test"
import { storageStateOf } from "./support/accounts"
import { expireInvitation, query, snapshotDatabase } from "./support/db"
import { appendWorkbookRow, describeWorkbook } from "./support/files"
import { expect, test } from "./support/fixtures"
import { chooseOption, lettersOnly, rowNamed, toast, uniqueSuffix } from "./support/ui"

test.use({ storageState: storageStateOf("admin") })

const logo = path.resolve(__dirname, "../../public/logo-ueb-sidebar.png")

async function chooseSelect(page: Page, id: string, option?: string | RegExp): Promise<void> {
  await page.locator(`#${id}`).click()
  const options = page.getByRole("option")
  await (option === undefined ? options.first() : options.filter({ hasText: option }).first()).click()
}

test.describe.serial("administration: faculties and careers", () => {
  const suffix = lettersOnly(uniqueSuffix())
  const faculty = `Facultad E2E ${suffix}`
  const career = `Carrera E2E ${suffix}`

  test.afterAll(async () => {
    await query("update carreras set carrera_activa = false where codigo_carrera = $1", [`E2E-${suffix}`])
  })

  test("admin creates a faculty with a logo, edits it and toggles its status", async ({ page, issues }) => {
    await page.goto("/admin/estructura-academica")
    await page.getByRole("button", { name: "Crear facultad" }).click()
    const dialog = page.getByRole("dialog", { name: "Nueva facultad" })
    await dialog.locator("#catalog-name").fill(faculty)
    await dialog.locator("#faculty-logo").setInputFiles(logo)
    await dialog.getByRole("button", { name: "Siguiente" }).click()
    const library = dialog.getByRole("checkbox").first()
    if (await library.isVisible({ timeout: 10_000 }).catch(() => false)) await library.check()
    await dialog.getByRole("button", { name: "Crear facultad" }).click()
    await expect(dialog).toBeHidden()
    const row = rowNamed(page, faculty, "button")
    await expect(row).toBeVisible()
    expect(await query("select 1 from facultades f join archivos a on a.archivo_id = f.logo_archivo_id where f.nombre_facultad = $1", [faculty])).toHaveLength(1)

    await row.getByRole("button", { name: faculty, exact: true }).click()
    await page.getByRole("dialog", { name: "Facultad" }).getByRole("button", { name: "Editar" }).click()
    const edit = page.getByRole("dialog", { name: "Editar facultad" })
    await edit.getByRole("textbox", { name: "Nombre (obligatorio)" }).fill(`${faculty} Norte`)
    await edit.getByRole("button", { name: "Guardar cambios" }).click()
    await expect(edit).toBeHidden()
    const renamed = rowNamed(page, `${faculty} Norte`, "button")
    await expect(renamed).toBeVisible()

    for (const action of ["Desactivar", "Reactivar"]) {
      await renamed.getByRole("button", { name: `${faculty} Norte`, exact: true }).click()
      await page.getByRole("dialog", { name: "Facultad" }).getByRole("button", { name: "Editar" }).click()
      const dialog = page.getByRole("dialog", { name: "Editar facultad" })
      await dialog.getByRole("button", { name: `${action} facultad` }).click()
      const confirm = page.getByRole("dialog", { name: `${action} facultad` })
      await confirm.getByRole("button", { name: action, exact: true }).click()
      await expect(confirm).toBeHidden()
      await expect(toast(page)).toBeVisible()
      if (await dialog.isVisible()) await dialog.getByRole("button", { name: "Cancelar" }).click()
      await expect(renamed).toContainText(action === "Desactivar" ? "Inactiva" : faculty)
    }
    await expect(renamed).not.toContainText("Inactiva")
    issues.expectClean()
  })

  test("admin creates a career in the new faculty", async ({ page, issues }) => {
    await page.goto("/admin/estructura-academica/carreras")
    await page.getByRole("button", { name: "Crear carrera" }).click()
    const dialog = page.getByRole("dialog", { name: "Nueva carrera" })
    await chooseSelect(page, "catalog-faculty", `${faculty} Norte`)
    await chooseSelect(page, "catalog-modality")
    await dialog.locator("#catalog-name").fill(career)
    await dialog.locator("#catalog-code").fill(`E2E-${suffix}`)
    await dialog.locator("#catalog-cycle-count").fill("2")
    await dialog.getByRole("button", { name: "Crear carrera" }).click()
    await expect(dialog).toBeHidden()
    await page.getByRole("searchbox", { name: "Buscar carrera" }).fill(career)
    await expect(page.getByRole("table").getByText(career)).toBeVisible()
    issues.expectClean()
  })

  const people = { coordinator: `COORDINA ${suffix}`, replacement: `REEMPLAZA ${suffix}` }
  const emailOf = (name: string) => `${name.toLowerCase().replace(/\s+/g, ".")}@ueb.edu.ec`

  async function createAccount(page: Page, surname: string, role: string): Promise<void> {
    await page.getByRole("button", { name: "Crear cuenta" }).click()
    const dialog = page.getByRole("dialog", { name: "Crear cuenta institucional" })
    await dialog.getByRole("textbox", { name: "Nombres (obligatorio)" }).fill("PRUEBA")
    await dialog.getByRole("textbox", { name: "Apellidos (obligatorio)" }).fill(surname)
    await dialog.getByRole("textbox", { name: "Correo institucional (obligatorio)" }).fill(emailOf(surname))
    await chooseOption(page, dialog.getByRole("combobox", { name: "Rol inicial (obligatorio)" }), role)
    await chooseOption(page, dialog.getByRole("combobox", { name: "Carrera (obligatorio)" }), career)
    await dialog.getByRole("button", { name: "Crear cuenta" }).click()
    await expect(dialog).toBeHidden()
    await page.getByRole("searchbox", { name: "Buscar por nombre o correo" }).fill(surname)
    await expect(page.getByRole("button", { name: `PRUEBA ${surname}`, exact: true })).toBeVisible()
    await page.getByRole("searchbox", { name: "Buscar por nombre o correo" }).fill("")
  }

  async function openAccount(page: Page, surname: string) {
    await page.getByRole("searchbox", { name: "Buscar por nombre o correo" }).fill(surname)
    await page.getByRole("button", { name: `PRUEBA ${surname}`, exact: true }).click()
    return page.getByRole("dialog", { name: "Datos de la cuenta" })
  }

  test("admin creates accounts, edits them and replaces a coordinator", async ({ page, issues }) => {
    await page.goto("/admin/usuarios")
    await createAccount(page, people.coordinator, "Coordinador")
    await createAccount(page, people.replacement, "Docente")

    const detail = await openAccount(page, people.replacement)
    await detail.getByRole("button", { name: "Editar" }).click()
    const edit = page.getByRole("dialog", { name: "Editar usuario" })
    await edit.getByRole("textbox", { name: "Nombres (obligatorio)" }).fill("PRUEBA")
    await chooseOption(page, edit.getByRole("combobox", { name: "Agregar otro rol (opcional)" }), /Coordinador/)
    await chooseOption(page, edit.getByRole("combobox", { name: /^Carrera/ }), career)
    await edit.getByRole("button", { name: "Guardar cambios" }).click()
    const replace = page.getByRole("dialog", { name: "Reemplazar coordinador" })
    await expect(replace).toContainText(people.coordinator)
    await replace.getByRole("button", { name: "Reemplazar", exact: true }).click()
    await expect(edit).toBeHidden()
    await expect(replace).toBeHidden()
    const roles = await query<{ email: string }>(
      `select u.correo_electronico as email from asignaciones_rol r join usuarios u using(usuario_id) join carreras c using(carrera_id)
        where c.nombre_carrera = $1 and r.rol = 'coordinador' and r.asignacion_rol_activa`,
      [career],
    )
    expect(roles.map((row) => row.email)).toEqual([emailOf(people.replacement)])
    issues.expectClean([/^http 422: PATCH .*\/api\/v1\/admin\/users\//, /status of 422 \(Unprocessable Entity\)/])
  })

  test("admin disables and re-enables an active account", async ({ page, issues }) => {
    await page.goto("/admin/usuarios")
    for (const label of ["Deshabilitar acceso", "Habilitar acceso"]) {
      await page.getByRole("searchbox", { name: "Buscar por nombre o correo" }).fill("docente2@email.com")
      await page.getByRole("button", { name: "ANA LUCÍA CHÁVEZ TORRES", exact: true }).click()
      const detail = page.getByRole("dialog", { name: "Datos de la cuenta" })
      await detail.getByRole("button", { name: label }).click()
      const confirm = page.getByRole("dialog", { name: label })
      await confirm.getByRole("button", { name: label.split(" ")[0], exact: true }).click()
      await expect(confirm).toBeHidden()
      await expect(toast(page)).toBeVisible()
      if (await detail.isVisible()) await detail.getByRole("button", { name: "Cerrar" }).last().click()
    }
    expect(await query("select 1 from usuarios where correo_electronico = 'docente2@email.com' and usuario_activo")).toHaveLength(1)
    issues.expectClean()
  })

  test("admin resends an expired activation and deletes the pending account", async ({ page, issues }) => {
    await expireInvitation(emailOf(people.coordinator))
    await page.goto("/admin/usuarios")
    const detail = await openAccount(page, people.coordinator)
    const resent = page.waitForResponse((response) => /\/resend-activation$/.test(response.url()))
    await detail.getByRole("button", { name: "Reenviar invitación" }).click()
    await page.getByRole("dialog", { name: "Reenviar invitación de activación" }).getByRole("button", { name: "Reenviar invitación" }).click()
    expect((await resent).status()).toBe(200)
    await expect(toast(page)).toBeVisible()
    const again = await openAccount(page, people.coordinator)
    await again.getByRole("button", { name: "Eliminar cuenta pendiente" }).click()
    const confirm = page.getByRole("dialog").filter({ hasText: /Eliminar/ }).last()
    await confirm.getByRole("button", { name: /Eliminar/ }).last().click()
    await expect(page.getByRole("button", { name: `PRUEBA ${people.coordinator}`, exact: true })).toHaveCount(0)
    issues.expectClean()
  })

  test("admin downloads the users template and imports one account", async ({ page, issues }, testInfo) => {
    await page.goto("/admin/usuarios")
    await page.getByRole("button", { name: "Importar desde Excel" }).click()
    const dialog = page.getByRole("dialog").filter({ has: page.locator("#import-spreadsheet-file") })
    const download = page.waitForEvent("download")
    await dialog.getByRole("button", { name: /Descargar/ }).click()
    const template = path.join(testInfo.outputDir, "usuarios.xlsx")
    await (await download).saveAs(template)
    testInfo.annotations.push({ type: "users-template", description: await describeWorkbook(template) })
    const filled = path.join(testInfo.outputDir, "usuarios-completo.xlsx")
    const surname = `IMPORTA ${suffix}`
    await appendWorkbookRow(template, filled, /correo/i, { Nombres: "PRUEBA", Apellidos: surname, Correo: emailOf(surname), Rol: "Docente", Carrera: `E2E-${suffix}` })
    await dialog.locator("#import-spreadsheet-file").setInputFiles(filled)
    await dialog.getByRole("button").filter({ hasText: /Revisar|Validar|Vista previa/ }).first().click()
    await expect(dialog.getByRole("table")).toBeVisible()
    await dialog.getByRole("button").filter({ hasText: /Importar/ }).last().click()
    await expect(toast(page)).toBeVisible()
    await page.keyboard.press("Escape")
    await page.getByRole("searchbox", { name: "Buscar por nombre o correo" }).fill(surname)
    await expect(page.getByRole("button", { name: `PRUEBA ${surname}`, exact: true })).toBeVisible()
    issues.expectClean()
  })
})

test.describe("administration: careers import", () => {
  const suffix = lettersOnly(uniqueSuffix())

  test.afterAll(async () => {
    await query("update carreras set carrera_activa = false where codigo_carrera = $1", [`IMP-${suffix}`])
  })

  test("admin downloads the careers template and imports one career", async ({ page, issues }, testInfo) => {
    await page.goto("/admin/estructura-academica/carreras")
    await page.getByRole("button", { name: "Importar desde Excel" }).click()
    const dialog = page.getByRole("dialog").filter({ has: page.locator("#import-spreadsheet-file") })
    const download = page.waitForEvent("download")
    await dialog.getByRole("button", { name: /Descargar/ }).click()
    const template = path.join(testInfo.outputDir, "carreras.xlsx")
    await (await download).saveAs(template)
    testInfo.annotations.push({ type: "careers-template", description: await describeWorkbook(template) })
    const filled = path.join(testInfo.outputDir, "carreras-completo.xlsx")
    await appendWorkbookRow(template, filled, /c[oó]digo/i, {
      Facultad: "Facultad de Ciencias Administrativas, Gestión Empresarial e Informática",
      Código: `IMP-${suffix}`,
      Nombre: `Carrera importada ${suffix}`,
      Modalidad: "Presencial",
      Ciclos: "2",
      "Cantidad de ciclos": "2",
      Número: "2",
      "N.º": "2",
    })
    await dialog.locator("#import-spreadsheet-file").setInputFiles(filled)
    await dialog.getByRole("button").filter({ hasText: /Revisar|Validar|Vista previa/ }).first().click()
    await expect(dialog.getByRole("table")).toBeVisible()
    await dialog.getByRole("button").filter({ hasText: /Importar/ }).last().click()
    await expect(toast(page)).toBeVisible()
    await page.keyboard.press("Escape")
    await page.getByRole("searchbox", { name: "Buscar carrera" }).fill(`Carrera importada ${suffix}`)
    await expect(page.getByRole("table").getByText(`Carrera importada ${suffix}`)).toBeVisible()
    issues.expectClean()
  })
})

test.describe.serial("administration: convocations, settings and template", () => {
  test("admin opens the impact view, pauses and resumes the convocation", async ({ page, issues }) => {
    await page.goto("/admin/periodos")
    const row = rowNamed(page, /\S/, "button").first()
    const options = page.getByRole("dialog", { name: /^Periodo académico / })

    await row.getByRole("button").click()
    await options.getByRole("button", { name: /^Finalizar/ }).click()
    const finalize = page.getByRole("dialog", { name: "Finalizar el periodo académico" })
    await expect(finalize.getByRole("table").first()).toBeVisible()
    await finalize.getByRole("button", { name: "Cancelar" }).click()
    await expect(finalize).toBeHidden()

    for (const [action, state] of [["Pausar", /Pausad/], ["Reanudar", /Abiert/]] as const) {
      if (!(await options.isVisible())) await row.getByRole("button").click()
      await options.getByRole("button", { name: new RegExp(`^${action}`) }).click()
      const dialog = page.getByRole("dialog", { name: `${action} el periodo académico` })
      await dialog.getByRole("button", { name: action, exact: true }).click()
      await expect(dialog).toBeHidden()
      await expect(row).toContainText(state)
    }
    const states = await query<{ state: string }>("select estado_convocatoria_universidad as state from convocatorias_universidad where finalizada_en is null")
    expect(states.map((item) => item.state)).toContain("abierto")
    issues.expectClean()
  })

  test("admin extends the delivery deadline", async ({ page, issues }) => {
    const snapshot = snapshotDatabase("before-deadline-extension")
    try {
      await query("update convocatorias_universidad set cantidad_prorrogas = 0 where finalizada_en is null")
      const [before] = await query<{ due: Date }>("select fecha_entrega as due from convocatorias_universidad where finalizada_en is null order by fecha_inicio desc limit 1")
      await page.goto("/admin/periodos")
      await rowNamed(page, /\S/, "button").first().getByRole("button").click()
      await page.getByRole("dialog", { name: /^Periodo académico / }).getByRole("button", { name: /^Prorrogar plazo/ }).click()
      const dialog = page.getByRole("dialog", { name: "Prorrogar el plazo de entrega" })
      await dialog.locator("#extension-due").click()
      const next = new Date(before!.due.getTime() + 2 * 86_400_000)
      const month = new Intl.DateTimeFormat("es-EC", { month: "long", timeZone: "America/Guayaquil" }).format(next)
      const day = new Intl.DateTimeFormat("es-EC", { day: "numeric", timeZone: "America/Guayaquil" }).format(next)
      const target = page.getByRole("grid").last().getByRole("button", { name: new RegExp(`\\b${day} de ${month}\\b`, "i") })
      for (let step = 0; step < 4 && !(await target.isVisible()); step += 1) await page.getByRole("button", { name: "Mes siguiente" }).click()
      await target.click()
      await dialog.getByRole("button", { name: /^Prorrogar/ }).last().click()
      await expect(dialog).toBeHidden()
      const [after] = await query<{ due: Date }>("select fecha_entrega as due from convocatorias_universidad where finalizada_en is null order by fecha_inicio desc limit 1")
      expect(after!.due.getTime()).toBeGreaterThan(before!.due.getTime())
      issues.expectClean()
    } finally {
      snapshot.restore()
    }
  })

  test("admin saves a system setting and restores it", async ({ page, issues }) => {
    await page.goto("/admin/configuracion/sistema")
    const hour = page.getByRole("textbox", { name: "Hora del resumen (obligatorio)" })
    const original = await hour.inputValue()
    const save = page.getByRole("region", { name: /^Notificaciones/ }).getByRole("button", { name: "Guardar" })
    for (const value of [original === "08:30" ? "08:15" : "08:30", original]) {
      await hour.fill(value)
      const saved = page.waitForResponse((response) => /system-settings\//.test(response.url()) && response.request().method() === "PUT")
      await save.click()
      expect((await saved).ok()).toBe(true)
      await page.reload()
      await expect(hour).toHaveValue(value)
    }
    for (const section of [/^Asistente de IA/, /^Biblioteca \(Koha\)/]) {
      await page.getByRole("button", { name: section }).click()
      await expect(page.getByRole("region", { name: section })).toBeVisible()
    }
    issues.expectClean()
  })

  test("admin views the template, its lock reason and the teacher preview", async ({ page, issues }) => {
    await page.goto("/admin/plantilla")
    await expect(page.getByRole("heading", { level: 1, name: "Plantilla de sílabo" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "11. Bibliografía" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Editar" })).toBeDisabled()
    await page.getByRole("button", { name: "¿Por qué?" }).click()
    await expect(page.getByRole("dialog").filter({ hasText: "No puede editar la plantilla mientras siga abierto" })).toBeVisible()
    await page.keyboard.press("Escape")
    await page.getByRole("button", { name: "Ver como docente" }).click()
    await expect(page.getByRole("button", { name: "Ver como docente" })).toHaveAttribute("aria-pressed", "true")
    await page.getByRole("tab", { name: "11. Bibliografía" }).click()
    await expect(page.getByRole("button", { name: "Buscar en la biblioteca" }).first()).toBeVisible()
    issues.expectClean()
  })
})
