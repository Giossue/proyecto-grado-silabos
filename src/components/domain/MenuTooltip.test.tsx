import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { MenuTooltip } from "@/components/domain/MenuTooltip"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

const renderMenu = () =>
  render(
    <MenuTooltip label="Opciones avanzadas">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" aria-label="Opciones avanzadas">
            Opciones
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Diseño</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </MenuTooltip>,
  )

describe("MenuTooltip", () => {
  it("hides the tooltip while its menu is open so one Escape closes the menu", async () => {
    renderMenu()
    const trigger = screen.getByRole("button", { name: "Opciones avanzadas" })
    await act(async () => {
      trigger.focus()
    })
    expect(screen.getByRole("tooltip")).toHaveTextContent("Opciones avanzadas")
    await act(async () => {
      fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" })
    })
    expect(screen.getByRole("menu")).toBeInTheDocument()
    expect(screen.queryByRole("tooltip")).toBeNull()
    await act(async () => {
      fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
    })
    expect(screen.queryByRole("menu")).toBeNull()
  })
})
