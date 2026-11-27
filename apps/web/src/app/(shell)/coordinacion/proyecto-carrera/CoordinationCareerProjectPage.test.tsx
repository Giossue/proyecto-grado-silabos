import { act, fireEvent, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getMallas, getScheduledSubjects, type ScheduledSubjects } from "@/api/career-academics"
import { getSession } from "@/api/session"
import { toast } from "@/lib/toast"
import { navigation } from "@/test/nextNavigation"
import { flush, renderWithProviders } from "@/test/render"
import CoordinationCareerProjectPage, { AdminCareerProjectPending } from "./CoordinationCareerProjectPage"

const panel = vi.hoisted(() => ({ uploadOpen: undefined as boolean | undefined }))
const bulk = vi.hoisted(() => ({ props: null as null | { open: boolean; subjects: { id: string; name: string; code: string }[]; onApplied: (message: string) => void } }))

vi.mock("next/navigation", () => import("@/test/nextNavigation"))
vi.mock("@/api/career-academics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/career-academics")>()),
  getScheduledSubjects: vi.fn(),
  getMallas: vi.fn(),
}))
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock("@/api/session", () => ({ getSession: vi.fn() }))
vi.mock("@/components/domain/academic/BulkFieldDialog", () => ({
  BulkFieldDialog: (props: NonNullable<typeof bulk.props>) => {
    bulk.props = props
    return props.open ? <div data-testid="bulk-dialog" /> : null
  },
}))
vi.mock("@/components/domain/academic/SupportDocumentsPanel", () => ({
  SupportDocumentsPanel: ({ uploadOpen }: { uploadOpen?: boolean }) => {
    panel.uploadOpen = uploadOpen
    return <div data-testid="support-documents" />
  },
}))
vi.mock("@/components/domain/ProcessLockAlert", () => ({ ProcessLockAlert: ({ message, hideAction }: { message?: string; hideAction?: boolean }) => <div data-testid="process-lock" data-action={hideAction ? "no" : "yes"}>{message}</div> }))

const subject = (id: string, nombre: string, ciclo: number, extra: Record<string, unknown> = {}) => ({ id, codigo_asignatura: id.toUpperCase(), malla_code: "SW-9", malla_name: "Malla SW-9", nombre, ciclo, generates_syllabus: true, profile_complete: true, ...extra })
const SW8 = { malla_code: "SW-8", malla_name: "Malla SW-8" }
const MALLAS = [
  { id: "malla-9", code: "SW-9", cycle_count: 3, state: "vigente" as const, subject_count: 4 },
  { id: "malla-8", code: "SW-8", cycle_count: 5, state: "vigente" as const, subject_count: 2 },
  { id: "malla-7", code: "SW-7", cycle_count: 4, state: "cerrada" as const, subject_count: 9 },
]
const TWO_MALLAS = [
  subject("m1", "Programación Básica", 1, { profile_complete: false }),
  subject("m2", "Matemática Discreta", 1),
  subject("m3", "Estructuras de Datos", 2),
  subject("v1", "Algoritmos", 3, SW8),
  subject("v2", "Lógica", 5, { ...SW8, profile_complete: false }),
]
const selector = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-tour="malla-selector"]')
const cycleRows = (): string[] => [...document.querySelectorAll('[data-slot="collapsible-trigger"]')].map((row) => row.textContent!)
const cardNames = (): string[] => [...document.querySelectorAll('[data-slot="card-title"]')].map((title) => title.textContent!)
const cardLinks = (): string[] => [...document.querySelectorAll<HTMLAnchorElement>('[data-slot="card-title"] a')].map((anchor) => anchor.getAttribute("href")!)
const optionsOf = async (label: string): Promise<string[]> => {
  const actor = userEvent.setup()
  await actor.click(screen.getByRole("combobox", { name: label }))
  const names = within(await screen.findByRole("listbox"))
    .getAllByRole("option")
    .map((option) => option.textContent ?? "")
  await actor.keyboard("{Escape}")
  await flush()

  return names
}
const choose = async (trigger: HTMLElement, option: string | RegExp): Promise<void> => {
  const actor = userEvent.setup()
  await actor.click(trigger)
  await actor.click(await screen.findByRole("option", { name: option }))
  await flush()
}
const chooseMalla = (code: string): Promise<void> => choose(screen.getByRole("combobox", { name: "Malla" }), new RegExp(`^Malla ${code} `))
const pressTab = async (name: string): Promise<void> => {
  fireEvent.mouseDown([...document.querySelectorAll('[role="tab"]')].find((item) => item.textContent === name)!, { button: 0 })
  await flush()
}
const checkbox = (label: string): HTMLButtonElement | null => document.querySelector<HTMLButtonElement>(`[role="checkbox"][aria-label="${label}"]`)
const checked = (label: string): string | null | undefined => checkbox(label)?.getAttribute("aria-checked")
const pressElement = async (element: Element | null | undefined): Promise<void> => {
  fireEvent.click(element!)
  await flush()
}
const mark = (label: string): Promise<void> => pressElement(checkbox(label))
const selectionBar = (): HTMLElement | null => document.querySelector<HTMLElement>('[role="region"][aria-label="Acciones sobre las materias seleccionadas"]')
const barButton = (text: string) => [...(selectionBar()?.querySelectorAll("button") ?? [])].find((item) => item.textContent?.trim() === text)
const excelButton = () => [...document.querySelectorAll("button")].find((item) => item.textContent?.includes("Excel"))
const OPEN_REASON = "Pause el proceso de sílabos de su carrera para editar el proyecto de carrera."
const CLOSED = "El proyecto de carrera no se puede editar con el proceso de sílabos finalizado."
const scheduled = (subjects: unknown[]) => ({ career: { lock_reason: null, lock: null }, options: { activeSubjects: subjects } }) as unknown as ScheduledSubjects
const mountPage = async () => {
  const view = renderWithProviders(<CoordinationCareerProjectPage />)
  await flush()
  return view
}
const openCycles = async (): Promise<void> => {
  for (const trigger of [...document.querySelectorAll('[data-slot="collapsible-trigger"]')]) fireEvent.click(trigger)
  await flush()
}

describe("Proyecto de carrera", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    navigation.reset("/coordinacion/proyecto-carrera")
    panel.uploadOpen = undefined
    bulk.props = null
    vi.mocked(getMallas).mockResolvedValue(MALLAS)
    vi.mocked(getSession).mockResolvedValue({ active_role: { code: "coordinador", career_id: "carrera-1" } } as never)
    vi.mocked(getScheduledSubjects).mockResolvedValue(
      scheduled([
        subject("m1", "Programación Básica", 1, { profile_complete: false, profile_total: 18, profile_filled: 12 }),
        subject("m2", "Matemática Discreta", 1),
        subject("m3", "Estructuras de Datos", 2),
        subject("m4", "Materia sin sílabo", 2, { generates_syllabus: false }),
      ]),
    )
  })

  it("muestra las materias de cada ciclo como tarjetas con el estado de su proyecto de carrera", async () => {
    await mountPage()
    await openCycles()

    const cards = [...document.querySelectorAll('ul[aria-label="Materias del ciclo 1"] [data-slot="card"]')]
    expect(cards.map((card) => card.querySelector('[data-slot="card-title"]')?.textContent)).toEqual(["Programación Básica", "Matemática Discreta"])
    expect(cards[0]!.textContent).toContain("12 de 18 campos")
    expect(cards[1]!.textContent).toContain("Completa")
    expect(document.body.textContent).not.toContain("Materia sin sílabo")
  })

  it("con una sola malla muestra el desplegable y no repite su nombre en las tarjetas", async () => {
    vi.mocked(getMallas).mockResolvedValue([MALLAS[0]!])
    vi.mocked(getScheduledSubjects).mockResolvedValue(scheduled([subject("m1", "Cálculo", 1), subject("m2", "Redes", 1)]))
    await mountPage()
    await openCycles()

    expect(selector()!.textContent).toBe("Malla SW-9 · Vigente · 3 ciclos")
    expect(await optionsOf("Malla")).toEqual(["Malla SW-9 · Vigente · 3 ciclos"])
    expect([...document.querySelectorAll('[data-slot="card"]')].map((card) => card.textContent)).toEqual(["CálculoCompleta", "RedesCompleta"])
  })

  it("cada tarjeta es un enlace con el nombre de la materia hacia la página de su proyecto de carrera", async () => {
    await mountPage()
    await openCycles()

    const link = (name: string) => [...document.querySelectorAll<HTMLAnchorElement>('[data-slot="card-title"] a')].find((anchor) => anchor.textContent === name)
    expect(link("Matemática Discreta")?.getAttribute("href")).toBe("/coordinacion/proyecto-carrera/sw-9/m2")
    expect(link("Estructuras de Datos")?.getAttribute("href")).toBe("/coordinacion/proyecto-carrera/sw-9/m3")
    expect(document.querySelector('[data-slot="card"][tabindex]')).toBeNull()
  })

  it("los documentos de apoyo son una pestaña con su propio botón para subir y sin el aviso de edición bloqueada", async () => {
    vi.mocked(getScheduledSubjects).mockResolvedValue({
      ...scheduled([subject("m2", "Matemática Discreta", 1)]),
      career: { lock_reason: null, lock: null, profile_lock_reason: CLOSED },
    } as unknown as ScheduledSubjects)
    await mountPage()
    expect(document.querySelector('[data-testid="process-lock"]')).not.toBeNull()
    expect(document.body.textContent).not.toContain("Subir documento")

    const tab = [...document.querySelectorAll('[role="tab"]')].find((item) => item.textContent === "Documentos de apoyo")!
    fireEvent.mouseDown(tab, { button: 0 })
    await flush()

    expect(document.body.textContent).toContain("Subir documento")
    expect(document.querySelector('[data-testid="process-lock"]')).toBeNull()
    expect(document.querySelector('[data-testid="support-documents"]')).not.toBeNull()
    expect(navigation.replace).toHaveBeenLastCalledWith("/coordinacion/proyecto-carrera?tab=documentos")
    fireEvent.click([...document.querySelectorAll("button")].find((button) => button.textContent === "Subir documento")!)
    await flush()
    expect(panel.uploadOpen).toBe(true)
  })

  it("en solo lectura muestra el motivo y no deja seleccionar materias", async () => {
    vi.mocked(getScheduledSubjects).mockResolvedValue({
      ...scheduled([subject("m2", "Matemática Discreta", 1)]),
      career: { lock_reason: null, lock: null, profile_lock_reason: CLOSED },
    } as unknown as ScheduledSubjects)
    await mountPage()
    await openCycles()

    expect(document.querySelector('[data-testid="process-lock"]')?.textContent).toBe(CLOSED)
    expect(document.querySelector('[data-testid="process-lock"]')?.getAttribute("data-action")).toBe("no")
    expect(cardNames()).toEqual(["Matemática Discreta"])
    expect(document.querySelector('[role="checkbox"]')).toBeNull()
    expect(selectionBar()).toBeNull()
  })

  it("con el proceso de sílabos abierto ofrece ir a pausarlo", async () => {
    vi.mocked(getScheduledSubjects).mockResolvedValue({
      ...scheduled([subject("m2", "Matemática Discreta", 1)]),
      career: { lock_reason: null, lock: null, profile_lock_reason: OPEN_REASON },
    } as unknown as ScheduledSubjects)
    await mountPage()

    expect(document.querySelector('[data-testid="process-lock"]')?.textContent).toBe(OPEN_REASON)
    expect(document.querySelector('[data-testid="process-lock"]')?.getAttribute("data-action")).toBe("yes")
  })

  it("sin bloqueo del servidor deja seleccionar materias aunque la malla esté bloqueada", async () => {
    vi.mocked(getScheduledSubjects).mockResolvedValue({
      ...scheduled([subject("m2", "Matemática Discreta", 1)]),
      career: { lock_reason: "Proceso de sílabos activo", lock: { scope: "convocation" }, profile_lock_reason: null },
    } as unknown as ScheduledSubjects)
    await mountPage()

    expect(document.querySelector('[data-testid="process-lock"]')).toBeNull()
    expect(checkbox("Seleccionar las materias del ciclo 1")).not.toBeNull()
  })

  it("ya no ofrece importar el proyecto de carrera desde Excel", async () => {
    await mountPage()

    expect(excelButton()).toBeUndefined()
  })

  it("al seleccionar una materia aparece la barra y «Llenar un campo» abre la ventana con ella", async () => {
    await mountPage()
    await openCycles()
    expect(selectionBar()).toBeNull()
    expect(bulk.props?.open ?? false).toBe(false)

    await mark("Seleccionar Programación Básica")

    expect(checked("Seleccionar Programación Básica")).toBe("true")
    expect(selectionBar()!.textContent).toContain("1 materia seleccionada")
    expect(navigation.push).not.toHaveBeenCalled()
    await pressElement(barButton("Llenar un campo"))

    expect(bulk.props!.open).toBe(true)
    expect(bulk.props!.subjects).toEqual([{ id: "m1", name: "Programación Básica", code: "M1" }])
  })

  it("la casilla del ciclo selecciona sus materias sin abrirlo y «Quitar selección» las suelta", async () => {
    await mountPage()

    await mark("Seleccionar las materias del ciclo 1")

    expect(cardNames()).toEqual([])
    expect(selectionBar()!.textContent).toContain("2 materias seleccionadas")
    await openCycles()
    expect([checked("Seleccionar Programación Básica"), checked("Seleccionar Matemática Discreta"), checked("Seleccionar Estructuras de Datos")]).toEqual(["true", "true", "false"])
    await mark("Seleccionar Matemática Discreta")
    expect(checked("Seleccionar las materias del ciclo 1")).toBe("mixed")
    await mark("Seleccionar las materias del ciclo 1")
    expect(checked("Seleccionar las materias del ciclo 1")).toBe("true")
    await pressElement(barButton("Quitar selección"))

    expect(selectionBar()).toBeNull()
    expect(checked("Seleccionar las materias del ciclo 1")).toBe("false")
  })

  it("«Seleccionar todas» toma solo las que se ven y conserva las ya seleccionadas", async () => {
    await mountPage()
    await mark("Seleccionar las materias del ciclo 1")
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "estructuras" } })
    await flush()
    expect(checked("Seleccionar todas las materias que se ven")).toBe("false")

    await mark("Seleccionar todas las materias que se ven")

    expect(selectionBar()!.textContent).toContain("3 materias seleccionadas")
    await mark("Seleccionar todas las materias que se ven")
    expect(selectionBar()!.textContent).toContain("2 materias seleccionadas")
  })

  it("después de llenar avisa, quita la selección y vuelve a leer las materias", async () => {
    await mountPage()
    await mark("Seleccionar las materias del ciclo 1")
    await pressElement(barButton("Llenar un campo"))

    await act(async () => bulk.props!.onApplied("Campo llenado en 2 materias"))
    await flush()

    expect(toast.success).toHaveBeenCalledWith("Campo llenado en 2 materias")
    expect(selectionBar()).toBeNull()
    expect(getScheduledSubjects).toHaveBeenCalledTimes(2)
  })

  it("abre directamente la pestaña de documentos con ?tab=documentos", async () => {
    navigation.reset("/coordinacion/proyecto-carrera?tab=documentos")
    await mountPage()

    expect(document.querySelector('[data-testid="support-documents"]')).not.toBeNull()
    expect(document.body.textContent).toContain("Subir documento")
  })
})

describe("Proyecto de carrera, una malla a la vez", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    navigation.reset("/coordinacion/proyecto-carrera")
    vi.mocked(getSession).mockResolvedValue({ active_role: { code: "coordinador", career_id: "carrera-1" } } as never)
    vi.mocked(getMallas).mockResolvedValue(MALLAS)
    vi.mocked(getScheduledSubjects).mockResolvedValue(scheduled(TWO_MALLAS))
  })

  it("abre la malla vigente y muestra solo sus ciclos, materias, contadores y ciclos del filtro", async () => {
    await mountPage()

    expect(getMallas).toHaveBeenCalledWith(null)
    expect(selector()!.textContent).toBe("Malla SW-9 · Vigente · 3 ciclos")
    expect(cycleRows()).toEqual(["Ciclo 11/2", "Ciclo 21/1"])
    expect(await optionsOf("Ciclo")).toEqual(["Todos los ciclos", "1", "2"])
    await openCycles()
    expect(cardNames()).toEqual(["Programación Básica", "Matemática Discreta", "Estructuras de Datos"])
    expect(document.querySelector('[data-slot="card"]')!.textContent).not.toContain("Malla")
  })

  it("el desplegable es el de la pantalla Malla, con las mallas abiertas y sin «Nueva malla»", async () => {
    await mountPage()

    expect(await optionsOf("Malla")).toEqual(["Malla SW-9 · Vigente · 3 ciclos", "Malla SW-8 · Vigente · 5 ciclos"])
    expect(selector()!.closest('[role="tabpanel"]')).toBeNull()
    expect(selector()).toHaveClass("max-w-72", "max-sm:max-w-none")
  })

  it("al cambiar de malla se quita la selección", async () => {
    await mountPage()
    await mark("Seleccionar las materias del ciclo 1")
    await chooseMalla("SW-8")

    expect(selectionBar()).toBeNull()
    await chooseMalla("SW-9")
    expect(selectionBar()).toBeNull()
  })

  it("al elegir otra malla muestra solo lo suyo y la deja en la dirección", async () => {
    await mountPage()
    await openCycles()

    await chooseMalla("SW-8")

    expect(cycleRows()).toEqual(["Ciclo 31/1", "Ciclo 50/1"])
    expect(cardNames()).toEqual([])
    expect(await optionsOf("Ciclo")).toEqual(["Todos los ciclos", "3", "5"])
    await openCycles()
    expect(cardNames()).toEqual(["Algoritmos", "Lógica"])
    expect(cardLinks()).toEqual(["/coordinacion/proyecto-carrera/sw-8/v1", "/coordinacion/proyecto-carrera/sw-8/v2"])
    expect(navigation.replace).toHaveBeenLastCalledWith("/coordinacion/proyecto-carrera?malla=sw-8")
    expect(navigation.push).not.toHaveBeenCalled()
    expect(getScheduledSubjects).toHaveBeenCalledTimes(1)
  })

  it("al cambiar de malla se quitan la búsqueda y los filtros de la anterior", async () => {
    await mountPage()
    await choose(screen.getByRole("combobox", { name: "Ciclo" }), "2")
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "estructuras" } })
    await flush()

    await chooseMalla("SW-8")

    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("")
    expect(screen.getByRole("combobox", { name: "Ciclo" }).textContent).toBe("Todos los ciclos")
    expect(cycleRows()).toEqual(["Ciclo 31/1", "Ciclo 50/1"])
  })

  it("al abrir una materia y volver conserva la malla elegida", async () => {
    const view = await mountPage()
    await chooseMalla("SW-8")
    view.unmount()

    await mountPage()

    expect(selector()!.textContent).toBe("Malla SW-8 · Vigente · 5 ciclos")
    expect(cycleRows()).toEqual(["Ciclo 31/1", "Ciclo 50/1"])
  })

  it("si la dirección pierde la malla, como al volver a entrar desde el menú, muestra la vigente", async () => {
    await mountPage()
    await chooseMalla("SW-8")

    act(() => navigation.set("/coordinacion/proyecto-carrera"))
    await flush()

    expect(selector()!.textContent).toBe("Malla SW-9 · Vigente · 3 ciclos")
  })

  it.each(["sw-8", "SW-8"])("la dirección con «malla=%s» abre esa malla", async (code) => {
    navigation.reset(`/coordinacion/proyecto-carrera?malla=${code}`)
    await mountPage()

    expect(selector()!.textContent).toBe("Malla SW-8 · Vigente · 5 ciclos")
  })

  it.each(["sw-7", "no-existe"])("una dirección con «malla=%s», cerrada o inexistente, abre la vigente", async (code) => {
    navigation.reset(`/coordinacion/proyecto-carrera?malla=${code}`)
    await mountPage()

    expect(selector()!.textContent).toBe("Malla SW-9 · Vigente · 3 ciclos")
    expect(cycleRows()).toEqual(["Ciclo 11/2", "Ciclo 21/1"])
  })

  it("cambiar de pestaña conserva la malla, y «Documentos de apoyo» sigue sin el desplegable", async () => {
    await mountPage()
    await chooseMalla("SW-8")

    await pressTab("Documentos de apoyo")
    expect(navigation.replace).toHaveBeenLastCalledWith("/coordinacion/proyecto-carrera?malla=sw-8&tab=documentos")
    expect(selector()).toBeNull()
    expect(document.querySelector('[data-testid="support-documents"]')).not.toBeNull()

    await pressTab("Materias")
    expect(navigation.replace).toHaveBeenLastCalledWith("/coordinacion/proyecto-carrera?malla=sw-8")
    expect(selector()!.textContent).toBe("Malla SW-8 · Vigente · 5 ciclos")
  })

  it("una malla sin materias lo dice y deja elegir otra", async () => {
    vi.mocked(getScheduledSubjects).mockResolvedValue(scheduled([subject("v1", "Algoritmos", 3, SW8)]))
    await mountPage()

    expect(document.body.textContent).toContain("La malla todavía no tiene materias")
    await chooseMalla("SW-8")
    expect(cycleRows()).toEqual(["Ciclo 31/1"])
  })

  it.each([
    ["no tiene mallas", []],
    ["solo tiene mallas cerradas", [MALLAS[2]!]],
  ])("si la carrera %s no muestra el desplegable y lo dice", async (_case, mallas) => {
    vi.mocked(getMallas).mockResolvedValue(mallas)
    vi.mocked(getScheduledSubjects).mockResolvedValue(scheduled([]))
    await mountPage()

    expect(selector()).toBeNull()
    expect(document.body.textContent).toContain("La carrera no tiene mallas vigentes")
  })

  it("mientras llegan las mallas anticipa el desplegable y la lista, sin mezclar materias", async () => {
    vi.mocked(getMallas).mockImplementation(() => new Promise(() => undefined))
    await mountPage()

    expect(document.querySelector('[data-skeleton="malla-selector"]')).toHaveClass("max-w-72", "max-sm:max-w-none")
    expect(document.querySelectorAll('[data-skeleton="accordion-row"]')).toHaveLength(3)
    expect(cycleRows()).toEqual([])
    expect(selector()).toBeNull()
  })

  it("si no se pueden leer las mallas ofrece reintentar y después muestra la lista", async () => {
    vi.mocked(getMallas).mockRejectedValueOnce(new Error("sin conexión"))
    await mountPage()
    expect(document.body.textContent).toContain("No se pudo cargar el proyecto de carrera")
    expect(cycleRows()).toEqual([])

    fireEvent.click([...document.querySelectorAll("button")].find((item) => item.textContent?.includes("Reintentar"))!)
    await flush()
    expect(cycleRows()).toEqual(["Ciclo 11/2", "Ciclo 21/1"])
  })

  it("la pantalla de Administración que busca la carrera anticipa el desplegable", () => {
    renderWithProviders(<AdminCareerProjectPending careerCode="RED" error={null} onRetry={() => undefined} />)

    expect(document.querySelector('[data-skeleton="malla-selector"]')).not.toBeNull()
    expect(document.querySelector('[data-skeleton="accordion-row"]')).not.toBeNull()
  })
})

describe("Proyecto de carrera elegido por Administración", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    navigation.reset("/admin/carreras/RED/proyecto-carrera")
    vi.mocked(getMallas).mockResolvedValue(MALLAS)
    vi.mocked(getScheduledSubjects).mockResolvedValue({ ...scheduled([subject("m2", "Matemática Discreta", 1), subject("v1", "Algoritmos", 3, SW8)]), career: { name: "Redes", lock_reason: null, lock: null } } as unknown as ScheduledSubjects)
  })

  it("también puede seleccionar materias para llenar un campo", async () => {
    renderWithProviders(<CoordinationCareerProjectPage adminCareer={{ id: "carrera-9", code: "RED" }} />)
    await flush()
    await mark("Seleccionar las materias del ciclo 1")

    expect(selectionBar()!.textContent).toContain("1 materia seleccionada")
  })

  it("también ve una malla a la vez, de la carrera indicada, y la deja en su dirección", async () => {
    renderWithProviders(<CoordinationCareerProjectPage adminCareer={{ id: "carrera-9", code: "RED" }} />)
    await flush()
    expect(getMallas).toHaveBeenCalledWith("carrera-9")
    expect(cycleRows()).toEqual(["Ciclo 11/1"])

    await chooseMalla("SW-8")
    await openCycles()
    expect(cardLinks()).toEqual(["/admin/carreras/red/proyecto-carrera/sw-8/v1"])
    expect(navigation.replace).toHaveBeenLastCalledWith("/admin/carreras/red/proyecto-carrera?malla=sw-8")
  })

  it("lee la carrera indicada, enlaza las materias a sus páginas de Administración y no ofrece documentos de apoyo", async () => {
    renderWithProviders(<CoordinationCareerProjectPage adminCareer={{ id: "carrera-9", code: "RED" }} />)
    await flush()
    await openCycles()

    expect(getSession).not.toHaveBeenCalled()
    expect(getScheduledSubjects).toHaveBeenCalledWith("carrera-9")
    expect(document.querySelector('[data-tour="page-header"]')!.textContent).toContain("Proyecto de Redes")
    expect(document.querySelector<HTMLAnchorElement>('[data-slot="card-title"] a')?.getAttribute("href")).toBe("/admin/carreras/red/proyecto-carrera/sw-9/m2")
    expect([...document.querySelectorAll('[role="tab"]')].some((tab) => tab.textContent === "Documentos de apoyo")).toBe(false)
    expect(document.querySelector('[data-testid="support-documents"]')).toBeNull()
  })
})
