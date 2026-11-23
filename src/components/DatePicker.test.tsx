import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { DatePicker } from "@/components/DatePicker"
import { Button } from "@/components/ui/button"
import { flush, renderWithProviders } from "@/test/render"

function Form({ required = true, day }: { required?: boolean; day: string }) {
  return (
    <form>
      <DatePicker id="d" value={day} required={required} />
      <Button type="submit">Guardar</Button>
    </form>
  )
}

const submit = (): HTMLButtonElement => screen.getByRole("button", { name: "Guardar" })

describe("DatePicker obligatorio", () => {
  it("mantiene deshabilitado el botón de enviar hasta que haya una fecha", async () => {
    const view = renderWithProviders(<Form day="" />)
    await flush()

    expect(submit().disabled).toBe(true)
    view.rerender(<Form day="2026-12-01" />)
    await flush()
    expect(submit().disabled).toBe(false)
  })

  it("si no es obligatorio no estorba", async () => {
    renderWithProviders(<Form day="" required={false} />)
    await flush()

    expect(submit().disabled).toBe(false)
  })

  it("muestra la fecha elegida con el formato de Ecuador", async () => {
    renderWithProviders(<Form day="2026-12-01" />)
    await flush()

    expect(document.getElementById("d")?.textContent).toContain("1 dic 2026")
  })
})
