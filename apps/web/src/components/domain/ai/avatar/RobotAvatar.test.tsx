import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { RobotAvatar } from "./RobotAvatar"

describe("RobotAvatar", () => {
  it("renderiza el blob con cuerpo y ojos proyectados", () => {
    const { container } = render(<RobotAvatar />)
    for (const id of ["robot_root", "body", "body_shell", "eyes", "eye_left", "eye_right"]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }
    expect(container.querySelector("#eye_left_dot")!.getAttribute("d")).toMatch(/^M-?\d/)
    expect(container.querySelector("img")).toBeNull()
  })

  it("elige la animación según modo y emoción", () => {
    const view = render(<RobotAvatar mode="thinking" />)
    const svg = () => view.container.querySelector("svg")!
    expect(svg().getAttribute("data-animation")).toBe("thinking")
    view.rerender(<RobotAvatar mode="speaking" />)
    expect(svg().getAttribute("data-animation")).toBe("speaking")
    view.rerender(<RobotAvatar mode="idle" emotion="surprised" />)
    expect(svg().getAttribute("data-animation")).toBe("surprised")
  })
})
