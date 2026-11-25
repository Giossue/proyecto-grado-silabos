import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { Button } from "@/components/ui/button"

function Modal({
  inDialog = true,
  locked = false,
}: {
  inDialog?: boolean
  locked?: boolean
}) {
  const [text, setText] = useState("")
  return (
    <div role={inDialog ? "dialog" : undefined}>
      <form>
        <input
          id="field"
          aria-label="Campo"
          value={text}
          onChange={(event) => setText(event.target.value)}
          required
        />
        <Button type="submit" disabled={locked}>
          Enviar
        </Button>
      </form>
    </div>
  )
}

const submit = () =>
  screen.getByRole("button", { name: "Enviar" }) as HTMLButtonElement
const field = () => screen.getByLabelText("Campo")

describe("Button de enviar de un formulario", () => {
  afterEach(cleanup)

  it("se puede presionar aunque falte un campo obligatorio", () => {
    render(<Modal />)
    expect(submit().disabled).toBe(false)

    fireEvent.change(field(), { target: { value: "Revise la unidad 2" } })
    expect(submit().disabled).toBe(false)
  })

  it("respeta su propio disabled", () => {
    render(<Modal locked />)
    fireEvent.change(field(), { target: { value: "texto" } })
    expect(submit().disabled).toBe(true)
  })

  it("también fuera de un modal", () => {
    render(<Modal inDialog={false} />)
    expect(submit().disabled).toBe(false)
  })
})
