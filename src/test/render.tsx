import { act, render, type RenderOptions } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { TooltipProvider } from "@/components/ui/tooltip"

const Providers = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>

export const renderWithProviders = (ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) =>
  render(ui, { wrapper: Providers, ...options })

export const flush = async (rounds = 3): Promise<void> => {
  for (let round = 0; round < rounds; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}
