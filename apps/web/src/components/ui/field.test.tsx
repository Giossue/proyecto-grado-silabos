import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Field, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const renderField = (invalid: boolean) =>
  render(
    <Field data-invalid={invalid}>
      <Input id="a" aria-label="A" aria-describedby="hint" />
      <Textarea id="b" aria-label="B" />
      <FieldError errors={invalid ? ["Falta este dato"] : []} />
    </Field>
  )

describe("Field", () => {
  afterEach(cleanup)

  it("enlaza el error con el control y lo marca inválido", () => {
    const { container } = renderField(true)
    const errorId = container
      .querySelector('[data-slot="field-error"]')
      ?.getAttribute("id")

    expect(errorId).toBeTruthy()
    expect(screen.getByLabelText("A")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByLabelText("A")).toHaveAttribute(
      "aria-describedby",
      `hint ${errorId}`
    )
    expect(screen.getByLabelText("B")).toHaveAttribute(
      "aria-describedby",
      errorId!
    )
  })

  it("no marca el control cuando no hay error", () => {
    renderField(false)

    expect(screen.getByLabelText("A")).not.toHaveAttribute("aria-invalid")
    expect(screen.getByLabelText("A")).toHaveAttribute(
      "aria-describedby",
      "hint"
    )
  })

  it("no deja un aviso vacío cuando el error no tiene mensaje", () => {
    const { container } = render(<FieldError errors={[undefined]} />)

    expect(container.querySelector('[role="alert"]')).toBeNull()
  })
})
