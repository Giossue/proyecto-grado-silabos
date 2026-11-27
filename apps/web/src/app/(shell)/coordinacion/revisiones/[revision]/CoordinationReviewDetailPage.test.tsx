import { cleanup, fireEvent, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { approveReview, compareReviews, getReview, requestCorrection, resetSyllabus, type ReviewDetail } from "@/api/reviews"
import { getSession } from "@/api/session"
import { DIALOG_EXIT_MS } from "@/lib/dialogExit"
import { trackNavigation } from "@/lib/goBack"
import { makeTestP12 } from "@/lib/signature/testCertificate"
import CoordinationReviewDetailPage from "./CoordinationReviewDetailPage"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"
import { confirmSignatureDialog, fillSignatureDialog } from "@/test/signatureDialog"

const route = vi.hoisted(() => ({ params: { revision: "revision-1" } as Record<string, string> }))

vi.mock("next/navigation", async () => ({ ...(await import("@/test/nextNavigation")), useParams: () => route.params }))
vi.mock("@/components/domain/RoleDeadlineBanner", () => ({ RoleDeadlineBanner: () => <div data-testid="role-deadline-banner" /> }))
vi.mock("@/api/session", () => ({ getSession: vi.fn() }))
vi.mock("@/api/reviews", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/reviews")>()),
  approveReview: vi.fn(),
  compareReviews: vi.fn(),
  getReview: vi.fn(),
  requestCorrection: vi.fn(),
  resetSyllabus: vi.fn(),
}))

const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })

const detail = (decisionsAllowed = true): ReviewDetail => ({
  syllabus: {
    id: "syllabus-1",
    subject: "Arquitectura de Software",
    code: "SW-601",
    period: "2026-2027",
    state: "en_revision",
    stage: "coordinacion",
    teachers: ["Docente Demo"],
  },
  my_stage: "coordinacion",
  can_decide: decisionsAllowed,
  signing_statement: decisionsAllowed ? "silabos-ueb|silabo:syllabus-1|accion:aprobacion_coordinacion|huella:abc" : null,
  signatures: [{ role: "docente", name: "Docente Demo", signed_at: "2026-09-16T10:00:00Z" }],
  presentation: {
    appearance: {
      font_family: "Arial",
      body_font_size: 11,
      title_font_size: 16,
      section_font_size: 13,
      field_font_size: 11,
      text_color: "#172033",
      accent_color: "#075da9",
      table_header_background: "#dbe6f4",
      table_header_color: "#315f92",
      margin_cm: 2.5,
      orientation: "portrait",
      title_bold: true,
      title_italic: false,
      title_alignment: "center",
      section_bold: true,
      section_italic: false,
      section_alignment: "left",
      body_alignment: "left",
    },
    title: "PROGRAMA DE ASIGNATURA (SÍLABO)",
    logos: { institution: "/institution.png", faculty: "/faculty.png" },
  },
  revision: {
    id: "revision-1",
    number: 1,
    submitted_at: "2026-09-16T10:00:00Z",
    submitted_by: "Docente Demo",
    is_current: true,
    snapshot: {
      sections: [{
        key: "descripcion",
        title: "Descripción",
        fields: [
          { key: "objetivo", label: "Objetivo general", quien_llena: "docente", value: doc("Contenido enviado") },
          { key: "perfil", label: "Descripción", quien_llena: "coordinacion", value: doc("Contenido heredado") },
          { key: "unidades", label: "Planificación", quien_llena: "docente", value: { type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Semana 1: Introducción" }] }] }] }] }] } },
          { key: "identificacion", label: "", quien_llena: "institucional", value: doc("FACULTAD: Ciencias") },
          { key: "conducta", label: "Conducta ética", quien_llena: "institucional", value: doc("Texto institucional") },
        ],
      }],
    },
  },
  history: [{
    id: "revision-1",
    number: 1,
    submitted_at: "2026-09-16T10:00:00Z",
    submitted_by: "Docente Demo",
    approved_at: null,
  }],
  timeline: [{ kind: "enviado", at: "2026-09-16T10:00:00Z", revision_id: "revision-1", revision_number: 1, by: "Docente Demo", comment: null, previous_id: null }],
  correction_request: null,
  decisions_allowed: decisionsAllowed,
  convocation_closed: !decisionsAllowed,
  reset: { allowed: false },
}) as unknown as ReviewDetail

const mountPage = async () => {
  const view = renderWithProviders(<CoordinationReviewDetailPage />)
  await flush()
  return view
}

const headerButton = (name: string): HTMLButtonElement | undefined =>
  [...document.querySelectorAll<HTMLButtonElement>("header button")].find((button) => button.textContent === name || button.getAttribute("aria-label") === name)
const type = (selector: string, value: string): void => {
  fireEvent.change(document.body.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!, { target: { value } })
}
const openMore = async (): Promise<void> => {
  fireEvent.keyDown(headerButton("Más")!, { key: "Enter" })
  await flush()
}
const chooseRestart = async (): Promise<void> => {
  fireEvent.click([...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent?.includes("Reiniciar sílabo"))!)
  await flush()
}

const simulateExitAnimation = (): void => {
  const style = document.createElement("style")
  style.dataset.exit = ""
  style.textContent = '[data-state="closed"] { animation-name: exit; }'
  document.head.append(style)
}
const exit = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, DIALOG_EXIT_MS))
  await flush()
}

describe("CoordinationReviewDetailPage", () => {
  beforeEach(() => {
    document.head.querySelectorAll("style[data-exit]").forEach((style) => style.remove())
    for (const mock of [approveReview, compareReviews, getReview, requestCorrection, resetSyllabus]) vi.mocked(mock).mockReset()
    navigation.reset("/coordinacion/revisiones/revision-1")
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "coordinator-1", name: "Coordinación Demo", email: "coordinator@example.test", email_verified: true, can_edit_identity: false },
      active_role: { id: "role-1", code: "coordinador", career_id: "career-1", career_name: "Software" },
      available_roles: [],
    } as never)
  })
  afterEach(() => {
    trackNavigation("/", null)
    cleanup()
    document.body.innerHTML = ""
  })

  it("en pausa no repite el motivo junto al estado: lo explica la franja", async () => {
    vi.mocked(getReview).mockResolvedValue({ ...detail(false), convocation_closed: false, decision_block: "El proceso de sílabos de la carrera está en pausa: las revisiones se retoman cuando se reanude." })
    const { container } = await mountPage()

    expect(container.querySelector('[data-testid="role-deadline-banner"]')).toBeNull()
    expect(container.textContent).not.toContain("está en pausa")
    expect(container.textContent).not.toContain("Proceso de sílabos finalizado")
    expect(headerButton("Firmar y aprobar")).toBeUndefined()
    expect(headerButton("Aprobar")).toBeUndefined()
  })

  it("deja la revisión solo para consulta con el proceso de sílabos finalizado", async () => {
    vi.mocked(getReview).mockResolvedValue(detail(false))
    const { container } = await mountPage()

    const banner = [...container.querySelectorAll('[role="status"]')].find((item) => item.textContent?.includes("Proceso de sílabos finalizado"))
    expect(banner?.textContent).toContain("Este sílabo queda solo para consulta")
    expect(container.textContent).not.toContain("Proceso de sílabos finalizado · solo consulta")
    expect(container.textContent).not.toContain("Proceso de sílabos cerrado")
    expect(headerButton("Solicitar corrección")).toBeUndefined()
    expect(headerButton("Firmar y aprobar")).toBeUndefined()
  })

  it("si se llegó desde el historial de la carrera, el enlace de arriba vuelve al historial", async () => {
    trackNavigation("/coordinacion/revisiones/revision-1", "/coordinacion/historial?period=p1")
    vi.mocked(getReview).mockResolvedValue(detail(false))
    const { container } = await mountPage()

    expect(container.textContent).toContain("Volver al historial")
    expect(container.textContent).not.toContain("Volver a la cola")
  })

  it("de una devolución de biblioteca solo dice quién devolvió, sin su comentario", async () => {
    vi.mocked(getReview).mockResolvedValue({ ...detail(), correction_request: { justification: null, requested_at: "2026-10-30T10:00:00Z", stage: "biblioteca", requested_by: null } })
    const { container } = await mountPage()

    expect(container.textContent).toContain("Corrección solicitada por biblioteca")
    expect(container.querySelector(".review-comment")).toBeNull()
  })

  it("de una corrección de coordinación muestra el comentario en una tarjeta", async () => {
    vi.mocked(getReview).mockResolvedValue({ ...detail(), correction_request: { justification: "Revise la unidad 2", requested_at: "2026-10-30T10:00:00Z", stage: "coordinacion", requested_by: "Coordinadora Demo" } })
    const { container } = await mountPage()

    expect(container.querySelector(".review-comment")!.textContent).toContain("Revise la unidad 2")
  })

  it("firma la declaración y aprueba el sílabo", async () => {
    vi.mocked(getReview).mockResolvedValue(detail())
    vi.mocked(approveReview).mockResolvedValue({ message: "Sílabo firmado y aprobado." })
    const { container } = await mountPage()

    expect(container.textContent).not.toContain("Firmado por Docente Demo (docente)")
    expect(container.textContent).not.toContain("SW-601")
    fireEvent.click(headerButton("Firmar y aprobar")!)
    await flush()
    await fillSignatureDialog(makeTestP12("COORDINACION DEMO", "clave"), "clave")
    await confirmSignatureDialog()

    expect(approveReview).toHaveBeenCalledWith("revision-1", {
      statement: "silabos-ueb|silabo:syllabus-1|accion:aprobacion_coordinacion|huella:abc",
      cms: expect.stringMatching(/^[A-Za-z0-9+/]+=*$/),
    })
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/coordinacion/revisiones"))
    expect(getReview).toHaveBeenCalledTimes(1)
  })

  it("si Coordinación ya firmó el sílabo, lo aprueba sin volver a firmar", async () => {
    vi.mocked(getReview).mockResolvedValue({ ...detail(), signing_statement: null })
    vi.mocked(approveReview).mockResolvedValue({ message: "Sílabo firmado y aprobado." })
    await mountPage()

    expect(headerButton("Firmar y aprobar")).toBeUndefined()
    fireEvent.click(headerButton("Aprobar")!)
    await flush()

    expect(approveReview).toHaveBeenCalledWith("revision-1", null)
    expect(navigation.replace).toHaveBeenCalledWith("/coordinacion/revisiones")
  })

  it("muestra en el diálogo el error de firma del servidor", async () => {
    vi.mocked(getReview).mockResolvedValue(detail())
    vi.mocked(approveReview).mockRejectedValue(new ApiError("Datos inválidos", 422, { signature: ["El certificado no es de una entidad de confianza"] }))
    await mountPage()

    fireEvent.click(headerButton("Firmar y aprobar")!)
    await flush()
    await fillSignatureDialog(makeTestP12("COORDINACION DEMO", "clave"), "clave")
    await confirmSignatureDialog()

    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("El certificado no es de una entidad de confianza")
  })

  it("solicita corrección con un comentario general", async () => {
    vi.mocked(getReview).mockResolvedValue(detail())
    vi.mocked(requestCorrection).mockResolvedValue({ message: "Corrección solicitada" })
    await mountPage()

    fireEvent.click(headerButton("Solicitar corrección")!)
    await flush()
    type("#correction-justification", "Debe precisar el resultado observado")
    await flush()
    fireEvent.submit(document.querySelector<HTMLFormElement>("#correction-form")!)
    await flush()

    expect(requestCorrection).toHaveBeenCalledWith("revision-1", {
      justification: "Debe precisar el resultado observado",
    })
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/coordinacion/revisiones"))
  })

  it("reinicia un sílabo aprobado desde «Más» al primer clic, sin modal ni motivo, y vuelve a la cola", async () => {
    vi.mocked(getReview).mockResolvedValue({ ...detail(), reset: { allowed: true, erases_history: true, revisions: 2, signatures: 3, has_pdf: true } })
    vi.mocked(resetSyllabus).mockResolvedValue({ message: "Sílabo reiniciado" })
    await mountPage()

    await openMore()
    expect(document.body.querySelectorAll('[role="menuitem"]')).toHaveLength(1)
    expect([...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].some((item) => item.textContent?.includes("Eliminar"))).toBe(false)
    await chooseRestart()

    expect(document.body.querySelector("#restart-reason")).toBeNull()
    expect(resetSyllabus).toHaveBeenCalledWith("syllabus-1")
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/coordinacion/revisiones"))
  })

  it("el historial lleva a su propia pantalla de versiones", async () => {
    vi.mocked(getReview).mockResolvedValue(detail())
    const { container } = await mountPage()

    expect(container.querySelector('[aria-label="Historial"]')).not.toBeNull()
  })

  it("desde la segunda versión «Comparar» muestra la anterior al lado y marca los campos que cambiaron solo en la actual", async () => {
    const second = detail()
    second.revision = { ...second.revision, id: "revision-2", number: 2 }
    second.history = [...second.history, { id: "revision-2", number: 2, submitted_at: "2026-09-20T10:00:00Z", submitted_by: "Docente Demo", approved_at: null }]
    vi.mocked(getReview).mockResolvedValue(second)
    vi.mocked(compareReviews).mockResolvedValue({
      syllabus: { id: "syllabus-1", subject: "Arquitectura de Software", code: "SW-601", period: "2026-2027" },
      comparison: { before_revision: 1, after_revision: 2, changed_fields: 1, changes: [{ section_key: "descripcion", section_title: "Descripción", field_key: "objetivo", label: "Objetivo general", quien_llena: "docente", change: "modified", before: null, after: null }] },
    } as never)
    const { container } = await mountPage()

    expect(container.querySelector("[data-change-mark]")).toBeNull()
    expect(container.querySelector('[aria-label="Versión anterior"]')).toBeNull()
    fireEvent.click(headerButton("Comparar con la versión anterior")!)
    await flush()

    expect(compareReviews).toHaveBeenCalledWith("revision-1", "revision-2")
    expect(getReview).toHaveBeenCalledWith("revision-1")
    expect(container.querySelector('[aria-label="Versión anterior"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Versión actual"]')).not.toBeNull()
    expect(container.querySelectorAll("[data-changed]")).toHaveLength(1)
    fireEvent.click(headerButton("Resaltar cambios")!)
    await flush()
    expect(container.querySelectorAll("[data-changed]")).toHaveLength(0)
    fireEvent.click(headerButton("Resaltar cambios")!)
    await flush()
    expect(container.querySelectorAll("[data-changed]")).toHaveLength(1)

    fireEvent.click(headerButton("Comparar con la versión anterior")!)
    await flush()
    expect(container.querySelector('[aria-label="Versión anterior"]')).toBeNull()
  })

  it("con el sílabo devuelto al docente no ofrece comparar, porque no hay una versión nueva que revisar", async () => {
    const returned = detail()
    returned.syllabus = { ...returned.syllabus, state: "correccion_solicitada", stage: null }
    returned.revision = { ...returned.revision, id: "revision-2", number: 2 }
    returned.history = [...returned.history, { id: "revision-2", number: 2, submitted_at: "2026-09-20T10:00:00Z", submitted_by: "Docente Demo", approved_at: null }]
    vi.mocked(getReview).mockResolvedValue(returned)
    const { container } = await mountPage()

    expect(container.querySelector('[aria-label="Historial"]')).not.toBeNull()
    expect(headerButton("Comparar con la versión anterior")).toBeUndefined()
  })

  it("con un solo envío no ofrece comparar", async () => {
    vi.mocked(getReview).mockResolvedValue(detail())
    await mountPage()

    expect(headerButton("Comparar con la versión anterior")).toBeUndefined()
  })

  it("distingue un fallo inicial de carga y permite reintentar", async () => {
    vi.mocked(getReview).mockRejectedValueOnce(new ApiError("Revisión no disponible", 503))
    const { container } = await mountPage()

    expect(container.textContent).toContain("Revisión no disponible")
    expect(container.textContent).toContain("Reintentar")

    vi.mocked(getReview).mockResolvedValueOnce(detail())
    fireEvent.click([...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Reintentar"))!)
    await flush()

    expect(getReview).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain("Contenido enviado")
  })

  it("muestra el sílabo como el documento final", async () => {
    vi.mocked(getReview).mockResolvedValue(detail())
    const { container } = await mountPage()

    const preview = container.querySelector<HTMLElement>('[aria-label="Vista previa del sílabo"]')!
    expect(preview.textContent).toContain("PROGRAMA DE ASIGNATURA (SÍLABO)")
    expect(preview.textContent).toContain("Contenido enviado")
    expect(preview.textContent).toContain("Contenido heredado")
    expect(preview.querySelector(".free-text-table")!.textContent).toContain("Semana 1")
    expect(preview.textContent).toContain("FACULTAD: Ciencias")
    expect(preview.textContent).toContain("Texto institucional")
  })

  it("al solicitar corrección, el diálogo se desvanece con el comentario escrito y luego vuelve a la cola", async () => {
    simulateExitAnimation()
    vi.mocked(getReview).mockResolvedValue(detail())
    vi.mocked(requestCorrection).mockResolvedValue({ message: "Corrección solicitada" })
    await mountPage()
    fireEvent.click(headerButton("Solicitar corrección")!)
    await flush()
    const textarea = (): HTMLTextAreaElement => document.querySelector<HTMLTextAreaElement>("#correction-justification")!
    type("#correction-justification", "Debe precisar el resultado observado")
    await flush()

    fireEvent.submit(document.querySelector<HTMLFormElement>("#correction-form")!)
    await flush()

    expect(requestCorrection).toHaveBeenCalled()
    expect(document.querySelector<HTMLElement>('[role="dialog"]')!.dataset.state).toBe("closed")
    expect(textarea().value).toBe("Debe precisar el resultado observado")
    expect(navigation.replace).not.toHaveBeenCalled()
    await exit()
    expect(navigation.replace).toHaveBeenCalledWith("/coordinacion/revisiones")
  })

  it("al reiniciar sin borrar el historial, refresca la revisión sin salir de ella", async () => {
    vi.mocked(getReview)
      .mockResolvedValueOnce({ ...detail(), reset: { allowed: true, erases_history: false, revisions: 1, signatures: 0, has_pdf: false } })
      .mockResolvedValue({ ...detail(), reset: { allowed: false } })
    vi.mocked(resetSyllabus).mockResolvedValue({ message: "Sílabo reiniciado" })
    await mountPage()
    await openMore()
    await chooseRestart()

    expect(resetSyllabus).toHaveBeenCalledWith("syllabus-1")
    await waitFor(() => expect(getReview).toHaveBeenCalledTimes(2))
    expect(navigation.replace).not.toHaveBeenCalled()
  })

  it("si el servidor rechaza el reinicio no sale de la revisión", async () => {
    vi.mocked(getReview).mockResolvedValue({ ...detail(), reset: { allowed: true, erases_history: true, revisions: 1, signatures: 0, has_pdf: false } })
    vi.mocked(resetSyllabus).mockRejectedValue(new ApiError("Datos inválidos.", 422, { syllabus: ["Solo se reinicia un sílabo aprobado."] }))
    await mountPage()
    await openMore()
    await chooseRestart()

    expect(resetSyllabus).toHaveBeenCalledWith("syllabus-1")
    expect(navigation.replace).not.toHaveBeenCalled()
  })
})
