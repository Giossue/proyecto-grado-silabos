import fs from "node:fs"
import { accounts, mailLogPaths, password, storageStateOf, type AccountKey } from "./support/accounts"
import { query } from "./support/db"
import { expect, test, watchPage } from "./support/fixtures"
import { chooseScope, fillLogin, loginAs, logout } from "./support/session"
import { freshCode, secretFromQr, typeCode } from "./support/totp"
import { toast } from "./support/ui"

const disposable = accounts.teacher3
const guestSessionProbe = /^http 401: GET .*\/api\/v1\/session$/
const guestSessionConsole = /^console: Failed to load resource: the server responded with a status of 401 .* @ .*\/ingresar$/

test.describe("login", () => {
  for (const key of ["admin", "coordinator", "teacher", "librarian"] satisfies AccountKey[]) {
    test(`${key} signs in and lands on their home`, async ({ page }) => {
      const health = watchPage(page)
      await page.goto("/ingresar")
      await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible()
      await expect(page.getByText("Mantener la sesión iniciada")).toHaveCount(0)
      await expect(page.getByRole("checkbox")).toHaveCount(0)
      health.reset()
      await loginAs(page, accounts[key])
      await expect(page.locator("[data-user-menu]")).toBeVisible()
      health.expectClean([guestSessionProbe, guestSessionConsole])
    })
  }

  test("a wrong password shows an error and keeps the user out", async ({ page }) => {
    await fillLogin(page, accounts.teacher2.email, "contraseña-incorrecta-e2e")
    await expect(page).toHaveURL(/\/ingresar/)
    await expect(page.getByText(/credenciales|incorrect/i).first()).toBeVisible()
  })

  test("the password field keeps every typed character", async ({ page }) => {
    await page.goto("/ingresar")
    await page.getByLabel("Correo institucional").pressSequentially(disposable.email, { delay: 10 })
    const field = page.locator("#password")
    await field.pressSequentially("tecleo-real-1234", { delay: 30 })
    await expect(field).toHaveValue("tecleo-real-1234")
    await expect(page.getByRole("button", { name: "Ingresar" })).toBeEnabled()
    await page.getByRole("button", { name: "Mostrar contraseña" }).click()
    await expect(field).toHaveAttribute("type", "text")
  })

  test("logout ends the session", async ({ page }) => {
    await loginAs(page, accounts.teacher2)
    await logout(page)
    await page.goto("/docente/mis-silabos")
    await expect(page).toHaveURL(/\/ingresar/)
  })

  test("the coordinator chooses a scope and switches career and role", async ({ page }) => {
    await fillLogin(page, accounts.coordinator.email, password())
    await expect(page).toHaveURL(/\/rol$/)
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Hola,")
    await chooseScope(page, "Software · SW-9", "Coordinación")
    await expect(page).toHaveURL(/\/coordinacion\/revisiones$/)
    await page.locator("[data-user-menu]").click()
    await page.getByRole("menuitem", { name: "Cambiar carrera o rol" }).click()
    await chooseScope(page, "Software · SW-8", "Docencia")
    await expect(page).toHaveURL(/\/docente\/mis-silabos$/)
    await expect(page.getByRole("list", { name: "Mis sílabos" })).toBeVisible()
  })
})

test.describe("route guards", () => {
  test("guests are sent to the login page", async ({ page }) => {
    for (const path of ["/panel", "/admin/usuarios", "/docente/mis-silabos", "/rol"]) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/ingresar/)
    }
  })

  test.describe("signed in", () => {
    test.use({ storageState: storageStateOf("teacher") })

    test("a teacher cannot open other roles' screens and skips the login page", async ({ page }) => {
      await page.goto("/ingresar")
      await expect(page).toHaveURL(/\/docente\/mis-silabos$/)
      for (const path of ["/admin/usuarios", "/coordinacion/malla", "/biblioteca/revisiones"]) {
        await page.goto(path)
        await expect(page).not.toHaveURL(new RegExp(`${path}$`))
      }
      await page.goto("/panel")
      await expect(page).toHaveURL(/\/docente\/mis-silabos$/)
    })
  })
})

test.describe.serial("account security", () => {
  test("two-factor authentication: enable, confirm, challenge on login and disable", async ({ browser }, testInfo) => {
    const used = new Set<string>()
    const owner = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: storageStateOf("teacher3") })
    const page = await owner.newPage()
    await page.goto("/docente/configuracion/seguridad")
    await page.getByRole("button", { name: /^Verificación en dos pasos/ }).click()
    await page.getByRole("button", { name: "Activar 2FA" }).click()
    const confirmPassword = page.getByRole("dialog", { name: "Activar la verificación en dos pasos" })
    await confirmPassword.locator("#confirm-current-password").fill(password())
    await confirmPassword.getByRole("button", { name: "Continuar" }).click()
    const setup = page.getByRole("dialog", { name: "Activar autenticación de dos factores" })
    const secret = await secretFromQr(setup.getByRole("img", { name: "Código QR para su aplicación autenticadora" }))
    let enabled = false
    try {
      await setup.getByRole("button", { name: "Continuar" }).click()
      const verify = page.getByRole("dialog", { name: "Verificar código de autenticación" })
      await typeCode(page, verify.locator("#otp"), await freshCode(secret, used))
      await verify.getByRole("button", { name: "Confirmar" }).click()
      await expect(verify).toBeHidden()
      enabled = true
      await expect(page.getByRole("button", { name: "Desactivar 2FA" })).toBeVisible()

      const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
      const second = await context.newPage()
      await fillLogin(second, disposable.email, password())
      await expect(second).toHaveURL(/\/verificar-dos-factores$/)
      await typeCode(second, second.locator("#otp"), await freshCode(secret, used))
      const submit = second.locator('form button[type="submit"]')
      await expect(submit).toBeEnabled()
      await submit.click()
      await expect(second).toHaveURL(/\/docente\/mis-silabos$/)
      await context.close()
    } finally {
      if (enabled) {
        await page.goto("/docente/configuracion/seguridad")
        await page.getByRole("button", { name: /^Verificación en dos pasos/ }).click()
        await page.getByRole("button", { name: "Desactivar 2FA" }).click()
        const disable = page.getByRole("dialog", { name: "Desactivar la verificación en dos pasos" })
        await disable.locator("#disable-current-password").fill(password())
        await disable.locator("#disable-code").fill(await freshCode(secret, used))
        await disable.getByRole("button").last().click()
        await expect(page.getByRole("button", { name: "Activar 2FA" })).toBeVisible()
      }
      await owner.close()
    }
  })

  test("password recovery sends a reset link by mail", async ({ page }) => {
    await query("delete from restablecimientos_contrasena where email = $1", [disposable.email])
    const sizes = new Map(mailLogPaths.map((file) => [file, fs.existsSync(file) ? fs.statSync(file).size : 0]))
    const newMail = () => mailLogPaths.map((file) => (fs.existsSync(file) ? fs.readFileSync(file).subarray(sizes.get(file) ?? 0).toString("utf8") : "")).join("\n")
    await page.goto("/recuperar-contrasena")
    await page.locator("#recovery-email").fill(disposable.email)
    await page.getByRole("button").filter({ hasText: /enlace|Enviar/ }).click()
    await expect(page.getByRole("status").filter({ hasText: /correo|enlace/i }).first()).toBeVisible()
    let link = ""
    await expect
      .poll(
        () => {
          const raw = newMail().replace(/=\r?\n/g, "").replace(/=3D/g, "=")
          const match = raw.includes(`To: ${disposable.email}`) ? raw.match(/https?:\/\/[^\s"<>]*restablecer-contrasena[^\s"<>]*/) : null
          link = match?.[0] ?? ""
          return link
        },
        { timeout: 60_000 },
      )
      .not.toBe("")
    const target = new URL(link)
    await page.goto(`${target.pathname}${target.search}`)
    await expect(page.locator("#new-password")).toBeVisible()
    await expect(page.locator("#reset-email")).toHaveValue(disposable.email)
  })

  test("password change and change back", async ({ page }) => {
    const temporary = `${password()}-E2e9`
    await loginAs(page, disposable)
    const change = async (current: string, next: string) => {
      await page.goto("/docente/configuracion/seguridad")
      await page.getByRole("button", { name: "Actualizar contraseña" }).click()
      const dialog = page.getByRole("dialog", { name: "Actualizar contraseña" })
      await dialog.locator("#current_password").fill(current)
      await dialog.locator("#password").fill(next)
      await dialog.locator("#password_confirmation").fill(next)
      await dialog.getByRole("button", { name: "Guardar" }).click()
      await expect(toast(page, "Contraseña actualizada")).toBeVisible()
    }
    await change(password(), temporary)
    try {
      await logout(page)
      await loginAs(page, disposable, temporary)
    } finally {
      await change(temporary, password())
    }
  })
})
