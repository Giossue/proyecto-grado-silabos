import { fireEvent, render } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { ChoiceGroup } from "@/components/domain/ChoiceGroup"

function Answer() {
  const [value, setValue] = useState<string | undefined>(undefined)
  return <ChoiceGroup label="Respuesta" value={value} options={[{ value: "si", label: "Sí" }, { value: "no", label: "No" }]} onValueChange={setValue} />
}

describe("ChoiceGroup", () => {
  it("empieza sin marcar y marca la opción elegida sin pasar de no controlado a controlado", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const view = render(<Answer />)
    const radios = () => [...view.container.querySelectorAll('[role="radio"]')]
    expect(radios().map((radio) => radio.getAttribute("aria-checked"))).toEqual(["false", "false"])

    fireEvent.click(radios()[1]!)

    expect(radios().map((radio) => radio.getAttribute("aria-checked"))).toEqual(["false", "true"])
    expect(warn.mock.calls.flat().join(" ")).not.toContain("uncontrolled")
    warn.mockRestore()
    view.unmount()
  })
})
