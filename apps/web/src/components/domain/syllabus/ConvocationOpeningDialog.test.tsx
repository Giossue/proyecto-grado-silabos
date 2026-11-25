import { fireEvent, render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/api/client"
import { createConvocation } from "@/api/convocations"
import { ConvocationOpeningDialog } from "@/components/domain/syllabus/ConvocationOpeningDialog"
import { flush } from "@/test/render"

vi.mock("@/api/convocations", () => ({ createConvocation: vi.fn() }))

const submitButton = (): HTMLButtonElement | undefined =>
  Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')).find((button) => button.textContent?.includes("Abrir convocatoria"))

const PROCESS_ID = "01a1c5ba-2222-7000-8000-999999999999"

describe("ConvocationOpeningDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = ""
    vi.mocked(createConvocation).mockReset()
    vi.mocked(createConvocation).mockResolvedValue({ message: "Convocatoria iniciada", convocation_id: "convocation-1" })
  })

  it("abre con el proceso institucional y los datos confirmados sin requerir fuentes", async () => {
    const onOpenChange = vi.fn()
    const onOpened = vi.fn()
    const { unmount } = render(<ConvocationOpeningDialog open processId={PROCESS_ID} period="2026-2027" onOpenChange={onOpenChange} onOpened={onOpened} />)
    await flush()

    const submit = submitButton()
    expect(document.body.querySelector('[role="dialog"] [role="checkbox"]')).toBeNull()
    expect(document.body.textContent).not.toContain("fuentes académicas")
    expect(submit?.disabled).toBe(false)
    fireEvent.click(submit!)
    await flush()

    expect(createConvocation).toHaveBeenCalledWith(PROCESS_ID)
    expect(onOpened.mock.calls).toEqual([["Convocatoria iniciada", "convocation-1"]])
    expect(onOpenChange.mock.calls).toContainEqual([false])
    unmount()
  })

  it("muestra el impedimento informado por el servidor y permite intentarlo otra vez", async () => {
    vi.mocked(createConvocation).mockRejectedValueOnce(new ApiError("La plantilla institucional está incompleta", 422))
    const onOpened = vi.fn()
    const { unmount } = render(<ConvocationOpeningDialog open processId={PROCESS_ID} period="2026-2027" onOpenChange={vi.fn()} onOpened={onOpened} />)
    await flush()

    const submit = submitButton()
    expect(submit?.disabled).toBe(false)
    fireEvent.click(submit!)
    await flush()
    expect(document.body.textContent).toContain("La plantilla institucional está incompleta")
    expect(onOpened).not.toHaveBeenCalled()
    expect(submitButton()?.disabled).toBe(false)
    unmount()
  })
})
