import { cleanup, fireEvent, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { commentLibraryReview, getLibraryReview, verifyLibraryReview, type LibraryReviewDetail } from "@/api/library"
import { DIALOG_EXIT_MS } from "@/lib/dialogExit"
import { trackNavigation } from "@/lib/goBack"
import { makeTestP12 } from "@/lib/signature/testCertificate"
import LibraryReviewDetailPage from "./LibraryReviewDetailPage"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"
import { confirmSignatureDialog, fillSignatureDialog } from "@/test/signatureDialog"

const { route, toastSuccess, openRevisionPdf } = vi.hoisted(() => ({
  route: { params: { revision: "revision-2" } as Record<string, string> },
  toastSuccess: vi.fn(),
  openRevisionPdf: vi.fn(),
}))

vi.mock("next/navigation", async () => ({ ...(await import("@/test/nextNavigation")), useParams: () => route.params }))
vi.mock("@/api/library", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/library")>()),
  getLibraryReview: vi.fn(),
  commentLibraryReview: vi.fn(),
  verifyLibraryReview: vi.fn(),
}))
vi.mock("@/lib/openPdf", () => ({ openRevisionPdf }))
vi.mock("@/lib/toast", () => ({ toast: { success: toastSuccess, error: vi.fn(), info: vi.fn() } }))

const detail = (overrides: Partial<LibraryReviewDetail> = {}): LibraryReviewDetail => ({
  revision_id: "revision-2",
  syllabus_id: "syllabus-1",
  subject: "Arquitectura de Software",
  code: "SW-601",
  career: "Software",
  period: "2026-2027",
  parallels: ["A"],
  teachers: ["Docente Demo"],
  revision_number: 2,
  sent_at: "2026-09-28T10:00:00-05:00",
  sent_by: "Docente Demo",
  state: "pendiente",
  outcome: null,
  syllabus_state: "en_revision",
  can_comment: true,
  can_verify: true,
  signing_statement: "silabos-ueb|silabo:syllabus-1|accion:aprobacion_biblioteca|huella:abc",
  signatures: [],
  verified_at: null,
  verified_by: null,
  presentation: { appearance: {}, title: "PROGRAMA DE ASIGNATURA (SÍLABO)", logos: { institution: "/ueb.png", faculty: "/facultad.png" } } as unknown as LibraryReviewDetail["presentation"],
  template_variables: {},
  sections: [{
    key: "bibliografia",
    title: "Bibliografía",
    fields: [{ key: "basica", label: "Bibliografía básica", quien_llena: "docente", value: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Sommerville, Ingeniería de software, 10.ª ed" }] }] } }],
  }],
  comments: [],
  comment_reasons: [
    { code: "libro_no_disponible", label: "El libro no está disponible en biblioteca" },
    { code: "codigo_incorrecto", label: "El código del libro es incorrecto" },
  ],
  ...overrides,
}) as LibraryReviewDetail

const mountPage = async () => {
  const view = renderWithProviders(<LibraryReviewDetailPage />)
  await flush()
  return view
}

const headerButton = (name: string): HTMLButtonElement | undefined =>
  [...document.querySelectorAll<HTMLButtonElement>("header button")].find((button) => button.textContent === name)
const openReturn = async (): Promise<void> => {
  fireEvent.click(headerButton("Devolver al docente")!)
  await flush()
}
const reasonBoxes = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('#library-comment-form [role="checkbox"]')]
const tickAll = async (): Promise<void> => {
  for (const box of reasonBoxes()) fireEvent.click(box)
  await flush()
}
const submitReturn = async (): Promise<void> => {
  fireEvent.submit(document.querySelector<HTMLFormElement>("#library-comment-form")!)
  await flush()
}

const simulateExitAnimation = (): void => {
  const style = document.createElement("style")
  style.dataset.exit = ""
  style.textContent = '[data-state="closed"] { animation-name: exit; }'
  document.head.append(style)
}

describe("LibraryReviewDetailPage", () => {
  beforeEach(() => {
    document.head.querySelectorAll("style[data-exit]").forEach((style) => style.remove())
    navigation.reset("/biblioteca/revisiones/revision-2")
    vi.mocked(getLibraryReview).mockReset()
    vi.mocked(commentLibraryReview).mockReset()
    vi.mocked(verifyLibraryReview).mockReset()
    toastSuccess.mockReset()
    openRevisionPdf.mockReset()
  })
  afterEach(() => {
    trackNavigation("/", null)
    cleanup()
    document.body.innerHTML = ""
  })

  it("muestra solo asignatura, carrera, docente y la bibliografía", async () => {
    vi.mocked(getLibraryReview).mockResolvedValue({ review: detail() })
    const { container } = await mountPage()

    expect(getLibraryReview).toHaveBeenCalledWith("revision-2")
    const text = container.textContent
    expect(text).toContain("Arquitectura de Software")
    expect(text).toContain("Software · Docente Demo")
    expect(text).toContain("Bibliografía básica")
    expect(text).toContain("Sommerville, Ingeniería de software")
    expect(text).not.toContain("Revisión 2")
    expect(text).not.toContain("Enviado por")
    expect(text).not.toContain("Por revisar")
    expect(headerButton("Devolver al docente")).toBeDefined()
    expect(headerButton("Firmar y enviar a coordinación")).toBeDefined()
    expect(headerButton("Enviar a coordinación")).toBeUndefined()
  })

  it("firma la bibliografía y la envía a coordinación", async () => {
    vi.mocked(getLibraryReview)
      .mockResolvedValueOnce({ review: detail() })
      .mockResolvedValueOnce({ review: detail({ state: "atendido", outcome: "firmado", can_verify: false, can_comment: false, signing_statement: null }) })
    vi.mocked(verifyLibraryReview).mockResolvedValue({ message: "Sílabo firmado y enviado a coordinación." })
    await mountPage()

    fireEvent.click(headerButton("Firmar y enviar a coordinación")!)
    await flush()
    expect(verifyLibraryReview).not.toHaveBeenCalled()
    await fillSignatureDialog(makeTestP12("BIBLIOTECA DEMO", "clave"), "clave")
    await confirmSignatureDialog()

    expect(verifyLibraryReview).toHaveBeenCalledWith("revision-2", {
      statement: "silabos-ueb|silabo:syllabus-1|accion:aprobacion_biblioteca|huella:abc",
      cms: expect.stringMatching(/^[A-Za-z0-9+/]+=*$/),
    })
    expect(toastSuccess).toHaveBeenCalledWith("Sílabo firmado y enviado a coordinación.")
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/biblioteca/revisiones"))
  })

  it("si Biblioteca ya firmó el sílabo, lo envía a coordinación sin volver a firmar", async () => {
    vi.mocked(getLibraryReview).mockResolvedValue({ review: detail({ signing_statement: null }) })
    vi.mocked(verifyLibraryReview).mockResolvedValue({ message: "Sílabo firmado y enviado a coordinación." })
    await mountPage()

    expect(headerButton("Firmar y enviar a coordinación")).toBeUndefined()
    fireEvent.click(headerButton("Enviar a coordinación")!)
    await flush()

    expect(verifyLibraryReview).toHaveBeenCalledWith("revision-2", null)
    expect(toastSuccess).toHaveBeenCalledWith("Sílabo firmado y enviado a coordinación.")
    expect(navigation.replace).toHaveBeenCalledWith("/biblioteca/revisiones")
  })

  it("con «Otro motivo» pide escribirlo y lo envía junto a los motivos marcados", async () => {
    vi.mocked(getLibraryReview).mockResolvedValue({ review: detail({
      comment_reasons: [
        { code: "libro_no_disponible", label: "El libro no está disponible en biblioteca" },
        { code: "otro", label: "Otro motivo" },
      ],
    }) })
    vi.mocked(commentLibraryReview).mockResolvedValue({ message: "Comentario enviado al docente" })
    await mountPage()

    await openReturn()
    await tickAll()
    await submitReturn()
    expect(document.body.textContent).toContain("Escriba el otro motivo (mínimo 5 caracteres)")
    expect(commentLibraryReview).not.toHaveBeenCalled()

    fireEvent.change(document.querySelector<HTMLTextAreaElement>("#library-other-reason")!, { target: { value: "Falta la 3.ª edición de Pressman" } })
    await flush()
    await submitReturn()

    expect(commentLibraryReview).toHaveBeenCalledWith("revision-2", {
      reasons: ["libro_no_disponible", "otro"],
      other: "Falta la 3.ª edición de Pressman",
    })
  })

  it("devuelve el sílabo con los motivos marcados", async () => {
    vi.mocked(getLibraryReview)
      .mockResolvedValueOnce({ review: detail() })
      .mockResolvedValueOnce({ review: detail({ state: "atendido", outcome: "devuelto", can_comment: false, can_verify: false }) })
    vi.mocked(commentLibraryReview).mockResolvedValue({ message: "Comentario enviado al docente" })
    await mountPage()

    await openReturn()
    await tickAll()
    await submitReturn()

    expect(commentLibraryReview).toHaveBeenCalledWith("revision-2", {
      reasons: ["libro_no_disponible", "codigo_incorrecto"],
    })
    expect(toastSuccess).toHaveBeenCalledWith("Comentario enviado al docente")
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/biblioteca/revisiones"))
  })

  it("solo ofrece el PDF, sin el ícono «Ver sílabo»", async () => {
    vi.mocked(getLibraryReview).mockResolvedValue({ review: detail() })
    const { container } = await mountPage()

    expect(container.querySelector('button[aria-label="Ver sílabo"]')).toBeNull()
  })

  it("si otro bibliotecario revisó el sílabo antes, avisa quién lo atiende y pide confirmar antes de actuar", async () => {
    vi.mocked(getLibraryReview).mockResolvedValue({ review: detail({ assigned_to_other: true, responsible: "Bibliotecaria Ana" }) })
    const { container } = await mountPage()

    expect(container.textContent).toContain("Lo atiende Bibliotecaria Ana, que lo revisó antes")
    fireEvent.click(headerButton("Devolver al docente")!)
    await flush()
    expect(document.body.textContent).toContain("¿Quiere continuar usted?")
    expect(document.body.querySelector("#library-comment-form")).toBeNull()

    fireEvent.click([...document.body.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Continuar")!)
    await flush()
    expect(document.body.querySelector("#library-comment-form")).not.toBeNull()
  })

  it("no devuelve sin motivos", async () => {
    vi.mocked(getLibraryReview).mockResolvedValue({ review: detail() })
    await mountPage()

    await openReturn()
    expect(document.querySelector<HTMLButtonElement>('#library-comment-form button[type="submit"]')!.disabled).toBe(true)
    await submitReturn()

    expect(commentLibraryReview).not.toHaveBeenCalled()
  })

  it("distingue un fallo inicial de carga y permite reintentar", async () => {
    vi.mocked(getLibraryReview).mockRejectedValueOnce(new ApiError("Revisión no disponible", 503))
    const { container } = await mountPage()

    expect(container.textContent).toContain("Revisión no disponible")
    vi.mocked(getLibraryReview).mockResolvedValueOnce({ review: detail() })
    fireEvent.click(container.querySelector("button")!)
    await flush()

    expect(getLibraryReview).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain("Bibliografía básica")
  })

  it("con el sílabo aprobado ofrece el botón «Ver PDF» con texto, también en el historial", async () => {
    openRevisionPdf.mockResolvedValue(null)
    vi.mocked(getLibraryReview).mockResolvedValue({ review: detail({ state: "atendido", outcome: "firmado", verified_at: "2026-10-01T10:00:00Z", verified_by: "Bibliotecario Demo", syllabus_state: "aprobado", approved_at: "2026-10-02T10:00:00Z", approved_document: { revision_id: "revision-3", approved_at: "2026-10-02T10:00:00Z", template_variables: {}, sections: [{ key: "datos", title: "Descripción de la asignatura", orientation: "portrait", fields: [{ id: "descripcion", key: "descripcion", label: "Descripción", quien_llena: "carrera", value: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Contenido de todo el sílabo" }] }] } }] }] }, can_comment: false, can_verify: false, signing_statement: null }) })
    await mountPage()

    fireEvent.click(headerButton("Ver PDF")!)

    expect(openRevisionPdf).toHaveBeenCalledWith("revision-3")
    expect(headerButton("Ver PDF")!.textContent).toBe("Ver PDF")
    expect(document.querySelector('[aria-label="Vista previa del sílabo"]')!.textContent).toContain("Contenido de todo el sílabo")
    expect(document.querySelector('article[aria-label="Bibliografía"]')).toBeNull()
    expect(document.querySelector("h1")!.parentElement!.textContent).toContain("Aprobado")
  })

  it("verificado pero sin la aprobación de Coordinación no ofrece «Ver PDF»", async () => {
    vi.mocked(getLibraryReview).mockResolvedValue({ review: detail({ state: "atendido", outcome: "firmado", verified_at: "2026-10-01T10:00:00Z", verified_by: "Bibliotecario Demo", approved_at: null, can_comment: false, can_verify: false, signing_statement: null }) })
    await mountPage()

    expect(headerButton("Ver PDF")).toBeUndefined()
    expect(document.body.textContent).toContain("En revisión")
    expect(document.body.textContent).toContain("En coordinación")
    expect(document.body.textContent).not.toContain("Aprobado")
    expect(document.querySelector('[aria-label="Vista previa del sílabo"]')).toBeNull()
  })

  it("antes de la aprobación no muestra el cuadro de firma de Biblioteca, solo la bibliografía", async () => {
    const signature = { key: "firma_biblioteca", label: "", quien_llena: "institucional", value: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Bibliografía verificada por" }, { type: "variable", attrs: { id: "firma_biblioteca" } }] }] } }
    const base = detail()
    vi.mocked(getLibraryReview).mockResolvedValue({ review: detail({ sections: [{ ...base.sections[0]!, fields: [...base.sections[0]!.fields, signature] as LibraryReviewDetail["sections"][number]["fields"] }] }) })
    const { container } = await mountPage()

    expect(container.textContent).toContain("Sommerville, Ingeniería de software")
    expect(container.textContent).not.toContain("Bibliografía verificada por")
  })

  it("si se llegó desde el historial, el enlace de arriba vuelve al historial", async () => {
    trackNavigation("/biblioteca/revisiones/revision-2", "/biblioteca/historial?period=all")
    vi.mocked(getLibraryReview).mockResolvedValue({ review: detail() })
    const { container } = await mountPage()

    expect(container.textContent).toContain("Volver al historial")
    expect(container.textContent).not.toContain("Volver a revisiones")
  })

  it("al devolver, el diálogo se desvanece con los motivos marcados y luego vuelve a la lista", async () => {
    simulateExitAnimation()
    vi.mocked(getLibraryReview).mockResolvedValue({ review: detail() })
    vi.mocked(commentLibraryReview).mockResolvedValue({ message: "Comentario enviado al docente" })
    await mountPage()
    await openReturn()
    await tickAll()

    await submitReturn()

    expect(commentLibraryReview).toHaveBeenCalled()
    expect(document.querySelector<HTMLElement>('[role="dialog"]')!.dataset.state).toBe("closed")
    expect(reasonBoxes().map((box) => box.getAttribute("aria-checked"))).toEqual(["true", "true"])
    expect(navigation.replace).not.toHaveBeenCalled()
    await new Promise((resolve) => setTimeout(resolve, DIALOG_EXIT_MS))
    await flush()
    expect(navigation.replace).toHaveBeenCalledWith("/biblioteca/revisiones")
  })
})
