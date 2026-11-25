// @vitest-environment node
import { describe, expect, it } from "vitest"
import { coordinatorLines, DAILY_SUMMARY_SUBJECT, renderMailable, resetPasswordUrl, type MailApp, type QueuedMail } from "./mailables"

const app: MailApp = { name: "Sílabos UEB", frontendUrl: "http://localhost:3000", locale: "es" }

const html = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

async function expectMail(mail: QueuedMail, expected: { subject: string; headers?: Record<string, string>; texts: string[]; links: Array<[string, string]> }) {
  const rendered = await renderMailable(mail, app)
  expect(rendered.subject).toBe(expected.subject)
  expect(rendered.headers).toEqual(expected.headers ?? {})
  expect(rendered.html).toContain(`<a href="${app.frontendUrl}"`)
  expect(rendered.html).toContain(">Sílabos UEB</a>")
  expect(rendered.text.startsWith("Sílabos UEB http://localhost:3000\n")).toBe(true)
  for (const text of expected.texts) {
    expect(rendered.html).toContain(html(text))
    expect(rendered.text).toContain(text)
  }
  for (const [label, url] of expected.links) {
    expect(rendered.html).toContain(`href="${html(url)}"`)
    expect(rendered.html).toContain(`>${html(label)}</span>`)
    expect(`${rendered.text}\n`).toContain(`${label} ${url}\n`)
  }
  expect(rendered.html).toMatchSnapshot()
  return rendered
}

describe("ManagedUserActivationMail", () => {
  const data = { name: "María Pérez", roleName: "Docente", activationUrl: "http://localhost:3000/activar-cuenta?token=abc%2Bdef", careerName: "Ingeniería en Software (Guaranda)" }

  it("invites a career user with high priority and the activation link", async () => {
    const rendered = await expectMail(
      { mailable: "activation", to: "maria@example.test", data },
      {
        subject: "Su invitación a Sílabos UEB",
        headers: { Importance: "high", "X-Priority": "1", Priority: "urgent" },
        texts: [
          "Le damos la bienvenida",
          "Hola María Pérez:",
          ". Para ingresar, elija su contraseña.",
          "El enlace es personal, de un solo uso y caduca en 7 días. Si no esperaba este correo, avise a la coordinación de su carrera.",
        ],
        links: [["Activar mi cuenta", data.activationUrl]],
      },
    )
    expect(rendered.html).toContain("Tiene una cuenta como <strong>Docente</strong> de la carrera <strong>Ingeniería en Software (Guaranda)</strong>. Para ingresar, elija su contraseña.")
    expect(rendered.text).toContain("Tiene una cuenta como Docente de la carrera Ingeniería en Software (Guaranda). Para ingresar, elija su contraseña.")
  })

  it("points a user without a career to the administration", async () => {
    const rendered = await renderMailable({ mailable: "activation", to: "admin@example.test", data: { ...data, roleName: "Administrador", careerName: null } }, app)
    expect(rendered.text).toContain("Tiene una cuenta como Administrador. Para ingresar, elija su contraseña.")
    expect(rendered.text).toContain("Si no esperaba este correo, avise a la administración del sistema.")
    expect(rendered.html).not.toContain("de la carrera")
  })
})

describe("WorkflowNotificationMail", () => {
  const data = {
    name: "María Pérez",
    title: "Sílabo devuelto para corrección",
    body: "Coordinación pidió corregir el sílabo de «Cálculo I» (Ingeniería en Software). Motivo: falta la bibliografía.",
    url: "http://localhost:3000/",
  }

  it("uses the notification title as subject and links to the system", async () => {
    await expectMail({ mailable: "workflow", to: "maria@example.test", data }, { subject: data.title, texts: ["Hola María Pérez:", data.body], links: [["Abrir el sistema", data.url]] })
  })

  it("escapes the body and falls back to the class subject without a title", async () => {
    const rendered = await renderMailable({ mailable: "workflow", to: "maria@example.test", data: { ...data, title: "", body: "Uno & <dos>" } }, app)
    expect(rendered.subject).toBe("Workflow Notification Mail")
    expect(rendered.html).toContain("Uno &amp; &lt;dos&gt;")
    expect(rendered.text).toContain("Uno & <dos>")
  })
})

describe("DailySummaryMail", () => {
  it("lists the pending work of the day", async () => {
    await expectMail(
      {
        mailable: "daily",
        to: "maria@example.test",
        data: { name: "María Pérez", lines: ["Ingeniería en Software: 2 sílabos en borrador.", "Derecho: 1 sílabo por corregir."], buttonLabel: "Abrir mis sílabos", url: "http://localhost:3000/docente/mis-silabos" },
      },
      {
        subject: DAILY_SUMMARY_SUBJECT,
        texts: ["Pendientes de hoy", "Hola María Pérez:", "Ingeniería en Software: 2 sílabos en borrador.", "Derecho: 1 sílabo por corregir."],
        links: [["Abrir mis sílabos", "http://localhost:3000/docente/mis-silabos"]],
      },
    )
  })
})

describe("CoordinatorSummaryMail", () => {
  it("lists only careers with syllabi to review and links to the reviews", async () => {
    const rendered = await expectMail(
      {
        mailable: "coordinator",
        to: "carlos@example.test",
        data: {
          name: "Carlos Ruiz",
          careers: [
            { career: "Ingeniería en Software", review: 1 },
            { career: "Derecho", review: 0 },
            { career: "Medicina & <Salud>", review: 3 },
          ],
          url: "http://localhost:3000/coordinacion/revisiones",
        },
      },
      {
        subject: DAILY_SUMMARY_SUBJECT,
        texts: ["Pendientes de hoy", "Hola Carlos Ruiz:", "Ingeniería en Software: 1 sílabo por revisar.", "Medicina & <Salud>: 3 sílabos por revisar."],
        links: [["Abrir revisión", "http://localhost:3000/coordinacion/revisiones"]],
      },
    )
    expect(rendered.text).not.toContain("Derecho")
  })

  it("lists only careers with syllabi to review, singular for one", () => {
    expect(coordinatorLines([{ career: "A", review: 1 }, { career: "B", review: 0 }, { career: "C", review: 2 }])).toEqual(["A: 1 sílabo por revisar.", "C: 2 sílabos por revisar."])
  })
})

describe("reset password mail", () => {
  const token = "a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4a1b2c3d4"
  const url = `http://localhost:3000/restablecer-contrasena?token=${token}&email=docente%40example.test`

  it("sends the reset link with its expiry and the copy-the-link subcopy", async () => {
    const rendered = await expectMail(
      { mailable: "resetPassword", to: "docente@example.test", data: { token, email: "docente@example.test", expireMinutes: 60 } },
      {
        subject: "Solicitud de cambio de contraseña",
        texts: [
          "Restablezca su contraseña",
          "Elija una contraseña nueva para su cuenta con el botón.",
          "El enlace caduca en 60 minutos.",
          "Si no hizo esta solicitud, ignore este correo; su contraseña no cambiará.",
          "Si el botón no funciona, copie este enlace en su navegador: ",
        ],
        links: [["Restablecer contraseña", url]],
      },
    )
    expect(rendered.html).toContain(`>${html(url)}</a>`)
    expect(rendered.text).toContain(`Si el botón no funciona, copie este enlace en su navegador: ${url}`)
  })

  it("builds the reset link with PHP's urlencode, like the FortifyServiceProvider callback", () => {
    expect(resetPasswordUrl("http://localhost:3000/", "a b+c~", "ana+x@example.test")).toBe(
      "http://localhost:3000/restablecer-contrasena?token=a+b%2Bc%7E&email=ana%2Bx%40example.test",
    )
  })
})
