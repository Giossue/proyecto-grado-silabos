import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { renderChatMarkdown } from "@/components/domain/ai/chatMarkdown"

const view = (text: string) => render(<div>{renderChatMarkdown(text)}</div>).container

describe("renderChatMarkdown", () => {
  it("convierte listas, numeradas y negritas sin interpretar HTML", () => {
    const container = view("**Unidad 1**\n- Tema uno\n- Tema dos\n\n1. Primero\n2. Segundo\n<script>alert(1)</script>")

    expect(container.querySelector("strong")!.textContent).toBe("Unidad 1")
    expect([...container.querySelectorAll("ul li")].map((item) => item.textContent)).toEqual(["Tema uno", "Tema dos"])
    expect(container.querySelectorAll("ol li")).toHaveLength(2)
    expect(container.querySelector("script")).toBeNull()
    expect(container.textContent).toContain("<script>alert(1)</script>")
  })

  it("la lista numerada deja margen para números de dos cifras, que si no se cortan por la izquierda", () => {
    const container = view(Array.from({ length: 12 }, (_, index) => `${index + 1}. Sección ${index + 1}`).join("\n"))

    expect(container.querySelectorAll("ol li")).toHaveLength(12)
    expect(container.querySelector("ol")!.classList).toContain("pl-8")
  })
})
