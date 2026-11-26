import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { DashboardDeadline } from "@/api/dashboard"
import { DeadlineBanner } from "@/components/domain/DeadlineBanner"

const deadline: DashboardDeadline = {
  period: "2026-2027",
  starts_at: "2026-09-24T00:00:00Z",
  due_at: "2026-09-28T00:00:00Z",
  state: "active",
  days_until_start: 0,
  days_until_due: 2,
  convocation_id: "c1",
  paused_by: null, classes_ended: false, career_pending: false,
}

type Audience = "docente" | "coordinador" | "bibliotecario" | "administrador"

const banner = (value: Partial<DashboardDeadline>, audience: Audience = "docente"): HTMLElement => {
  const { container, unmount } = render(<DeadlineBanner deadline={{ ...deadline, ...value }} audience={audience} />)
  const element = container.querySelector<HTMLElement>('[role="status"]')!.cloneNode(true) as HTMLElement
  unmount()
  return element
}

describe("DeadlineBanner", () => {
  it("dice para qué son los días y hasta cuándo, sin barra ni botones", () => {
    const element = banner({})

    expect(element.textContent).toBe("Quedan 2 días para enviar sus sílabos a revisiónHasta el 28 de septiembre de 2026")
    expect(element.querySelector('[role="progressbar"], button, a')).toBeNull()
  })

  it.each([
    [{ days_until_due: 1 }, "Queda 1 día para enviar sus sílabos a revisión"],
    [{ days_until_due: 0 }, "Hoy es el último día para enviar sus sílabos a revisión"],
    [{ state: "upcoming", days_until_start: 3 }, "La elaboración de sus sílabos inicia en 3 días"],
    [{ state: "upcoming", days_until_start: 1 }, "La elaboración de sus sílabos inicia mañana"],
    [{ state: "overdue", days_until_due: 0 }, "Venció el plazo para enviar sus sílabos a revisión"],
  ] as const)("explica cada momento del plazo: %o", (value, headline) => {
    expect(banner(value).textContent).toContain(headline)
  })

  it.each([
    ["coordinador", "Quedan 2 días para recibir y revisar los sílabos de su carreraHasta el 28 de septiembre de 2026"],
    ["bibliotecario", "Quedan 2 días para revisar y firmar los sílabosHasta el 28 de septiembre de 2026"],
  ] as const)("dice a %s qué le toca hacer antes del plazo", (audience, notice) => {
    expect(banner({}, audience).textContent).toBe(notice)
  })

  it("avisa a Biblioteca, antes de empezar, hasta cuándo deben quedar firmados", () => {
    expect(banner({ state: "upcoming", days_until_start: 3 }, "bibliotecario").textContent).toBe("La elaboración de los sílabos inicia en 3 díasDeben quedar revisados y firmados hasta el 28 de septiembre de 2026")
  })

  it("con el plazo vencido sale en rojo y dice a cada rol qué le queda", () => {
    const teacher = banner({ state: "overdue" })
    expect(teacher).toHaveClass("bg-destructive/10")
    expect(teacher).not.toHaveClass("bg-notice")
    expect(teacher.textContent).toBe("Venció el plazo para enviar sus sílabos a revisiónEra hasta el 28 de septiembre de 2026. Pida una prórroga a Administración")
    for (const audience of ["coordinador", "bibliotecario"] as const) {
      expect(banner({ state: "overdue" }, audience).textContent).toBe("Venció el plazo de entrega de los sílabosEra hasta el 28 de septiembre de 2026. Solo puede revisar lo ya enviado")
    }
    expect(banner({})).toHaveClass("bg-notice")
  })

  it("finalizada dice que los sílabos quedan para consulta, sin conteo", () => {
    expect(banner({ state: "closed", days_until_due: 0 }).textContent).toBe("El periodo académico finalizóSus sílabos quedan solo para consulta")
    expect(banner({ state: "closed" }, "coordinador").textContent).toBe("El periodo académico finalizóLos sílabos de la carrera quedan solo para consulta")
    expect(banner({ state: "closed" }, "bibliotecario").textContent).toBe("El periodo académico finalizóLos sílabos quedan solo para consulta")
  })

  it("Administración sabe qué puede hacer con el periodo académico finalizado", () => {
    expect(banner({ state: "closed", classes_ended: false }, "administrador").textContent).toBe("El periodo académico finalizóPuede reabrirlo con una prórroga o abrir uno nuevo")
    expect(banner({ state: "closed", classes_ended: true }, "administrador").textContent).toBe("El periodo académico finalizóPuede abrir uno nuevo")
  })

  it("Coordinación ve que aún no abre el periodo académico de su carrera", () => {
    expect(banner({ state: "active", career_pending: true }, "coordinador").textContent).toContain("Aún no abre el periodo académico de su carrera")
    expect(banner({ state: "paused", paused_by: "administracion", career_pending: true }, "coordinador").textContent).not.toContain("Aún no abre")
  })

  it.each([
    ["docente", "administracion", "El periodo académico está en pausaLe avisaremos cuando se reanude para que siga con sus sílabos"],
    ["docente", "coordinacion", "El periodo académico está en pausaLe avisaremos cuando se reanude para que siga con sus sílabos"],
    ["coordinador", "administracion", "El periodo académico está en pausaAdministración pausó el periodo académico. Las revisiones se retoman cuando lo reanude; le avisaremos"],
    ["coordinador", "coordinacion", "El periodo académico de su carrera está en pausaMientras tanto no se edita ni se revisa. Puede reanudarlo desde Revisión"],
    ["administrador", "administracion", "El periodo académico está en pausaPuede reanudarlo desde Periodos académicos"],
    ["bibliotecario", "administracion", "El periodo académico está en pausaAdministración pausó el periodo académico. Las revisiones se retoman cuando lo reanude; le avisaremos"],
  ] as const)("en pausa, a %s (pausó %s) le dice lo que le toca", (audience, pausedBy, expected) => {
    expect(banner({ state: "paused", days_until_due: 0, paused_by: pausedBy }, audience).textContent).toBe(expected)
  })
})
