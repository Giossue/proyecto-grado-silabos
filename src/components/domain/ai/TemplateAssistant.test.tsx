import { act, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { clearTemplateAssistant, getTemplateAssistant, sendTemplateAssistantMessage, type TemplateAssistantChat, type TemplateAssistantMessage } from "@/api/templateAssistant"
import { TooltipProvider } from "@/components/ui/tooltip"
import { TemplateAssistant } from "./TemplateAssistant"

vi.mock("@/api/templateAssistant", () => ({ getTemplateAssistant: vi.fn(), sendTemplateAssistantMessage: vi.fn(), clearTemplateAssistant: vi.fn() }))
vi.mock("@/components/domain/ai/avatar/RobotAvatar", () => ({ RobotAvatar: () => <span data-robot-avatar /> }))

const empty: TemplateAssistantChat = { available: true, locked: false, suggestions: ["¿Qué campos llena Coordinación?"], messages: [] }
const question: TemplateAssistantMessage = { id: "q-1", role: "usuario", status: "completado", result: null, content: "Agrega Competencias", error: null, created_at: "2026-10-31T10:00:00Z", proposal: null }
const answer: TemplateAssistantMessage = { id: "a-1", role: "asistente", status: "completado", result: "propuesta", content: "Propongo **Competencias**.", error: null, created_at: "2026-10-31T10:00:05Z", proposal: { id: "p-1", status: "pendiente", changes: ["Nuevo campo «Competencias» en «4. Resultados de aprendizaje»."], draft_version: "sesion:3" } }
const chat = (...messages: TemplateAssistantMessage[]): TemplateAssistantChat => ({ ...empty, messages })
const draft = { sections: [], version: "sesion:3" }

type Props = { refresh?: number; draftVersion?: string; busy?: string | null }
const mount = (props: Props = {}) => {
  const onApply = vi.fn()
  const onDiscard = vi.fn()
  const element = (next: Props) => (
    <TooltipProvider>
      <TemplateAssistant refresh={0} draftVersion="sesion:3" snapshot={() => draft} busy={null} onApply={onApply} onDiscard={onDiscard} {...next} />
    </TooltipProvider>
  )
  let current = props
  const view = render(element(current))
  return {
    container: view.container,
    onApply,
    onDiscard,
    setProps: async (next: Props) => {
      current = { ...current, ...next }
      view.rerender(element(current))
      await settle()
    },
  }
}
const settle = async (rounds = 4): Promise<void> => {
  for (let round = 0; round < rounds; round += 1) {
    await act(async () => {
      if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0)
      else await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}
const button = (container: HTMLElement, text: string) => [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === text)

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getTemplateAssistant).mockResolvedValue(empty)
  vi.mocked(sendTemplateAssistantMessage).mockResolvedValue({ message: "El pedido quedó registrado.", assistant_message_id: "a-1" })
  vi.mocked(clearTemplateAssistant).mockResolvedValue({ message: "Nuevo chat iniciado." })
})
afterEach(() => { vi.useRealTimers() })

describe("TemplateAssistant", () => {
  it("envía el pedido con el borrador del editor hasta recibir la propuesta", async () => {
    vi.useFakeTimers()
    vi.mocked(getTemplateAssistant).mockResolvedValueOnce(empty).mockResolvedValueOnce(chat(question, { ...answer, status: "pendiente", content: "", proposal: null })).mockResolvedValueOnce(chat(question, answer))
    const { container } = mount()
    await settle()

    expect(container.textContent).toContain("Pida un cambio a la plantilla")
    fireEvent.click(button(container, "¿Qué campos llena Coordinación?")!)
    await settle()
    expect(container.querySelector("textarea")!.value).toBe("¿Qué campos llena Coordinación?")
    fireEvent.change(container.querySelector("textarea")!, { target: { value: "  Agrega Competencias  " } })
    fireEvent.submit(container.querySelector("form")!)
    await settle()

    expect(sendTemplateAssistantMessage).toHaveBeenCalledWith("Agrega Competencias", draft, expect.any(String))
    expect(container.textContent).toContain("Preparando la propuesta")
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500)
    })
    await settle()

    expect(container.querySelector("strong")!.textContent).toBe("Competencias")
    expect(container.querySelector("[data-proposal]")!.textContent).toContain("Nuevo campo «Competencias» en «4. Resultados de aprendizaje»")
    expect(container.querySelector("[data-proposal]")!.textContent).not.toContain("aprendizaje».")
    expect(container.textContent).toContain("Los cambios aplicados se guardan con «Guardar»")
  })

  it("aplica o descarta la propuesta pendiente del borrador actual", async () => {
    vi.mocked(getTemplateAssistant).mockResolvedValue(chat(question, answer))
    const { container, onApply, onDiscard, setProps } = mount()
    await settle()

    fireEvent.click(button(container, "Aplicar")!)
    fireEvent.click(button(container, "Descartar")!)
    expect(onApply).toHaveBeenCalledWith("p-1")
    expect(onDiscard).toHaveBeenCalledWith("p-1")

    await setProps({ busy: "p-1" })
    expect(button(container, "Aplicar")!.disabled).toBe(true)
  })

  it("marca como vencida la propuesta si el borrador cambió después del pedido", async () => {
    vi.mocked(getTemplateAssistant).mockResolvedValue(chat(question, answer))
    const { container } = mount({ draftVersion: "sesion:4" })
    await settle()

    expect(container.querySelector("[data-proposal]")!.textContent).toContain("Vencida: el borrador cambió")
    expect(button(container, "Aplicar")).toBeUndefined()
  })

  it("muestra el estado de las propuestas que ya no están pendientes", async () => {
    vi.mocked(getTemplateAssistant).mockResolvedValue(chat(
      { ...answer, id: "a-1", proposal: { id: "p-1", status: "reemplazada", changes: ["Uno."], draft_version: "sesion:3" } },
      { ...answer, id: "a-2", proposal: { id: "p-2", status: "descartada", changes: ["Dos."], draft_version: "sesion:3" } },
      { ...answer, id: "a-3", proposal: { id: "p-3", status: "aplicada", changes: ["Tres."], draft_version: "sesion:3" } },
    ))
    const { container } = mount()
    await settle()

    const text = container.textContent
    expect(text).toContain("Reemplazada por otra propuesta")
    expect(text).toContain("Descartada")
    expect(text).toContain("Aplicada")
    expect(container.querySelectorAll("[data-proposal] button")).toHaveLength(0)
  })

  it("vuelve a cargar cuando la página lo pide y empieza un chat nuevo", async () => {
    vi.mocked(getTemplateAssistant).mockResolvedValue(chat(question, answer))
    const { container, setProps } = mount()
    await settle()
    await setProps({ refresh: 1 })
    expect(getTemplateAssistant).toHaveBeenCalledTimes(2)

    vi.mocked(getTemplateAssistant).mockResolvedValue(empty)
    fireEvent.click([...container.querySelectorAll("button")].find((item) => item.textContent?.includes("Nuevo chat"))!)
    await settle()

    expect(clearTemplateAssistant).toHaveBeenCalledOnce()
    expect(container.textContent).toContain("Pida un cambio a la plantilla")
  })

  it("avisa si no está disponible", async () => {
    vi.mocked(getTemplateAssistant).mockResolvedValue({ ...empty, available: false })
    const { container } = mount()
    await settle()

    expect(container.textContent).toContain("El asistente no está disponible por ahora")
    expect(container.querySelector("textarea")!.disabled).toBe(true)
  })
})
