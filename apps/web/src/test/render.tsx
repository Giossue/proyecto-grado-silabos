import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, renderHook, type RenderHookOptions, type RenderOptions } from "@testing-library/react"
import type { ReactElement, ReactNode } from "react"
import { TooltipProvider } from "@/components/ui/tooltip"

export const createTestQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  })

export const createWrapper = (client: QueryClient = createTestQueryClient()) =>
  function TestProviders({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    )
  }

export const renderWithProviders = (ui: ReactElement, options?: Omit<RenderOptions, "wrapper"> & { queryClient?: QueryClient }) => {
  const { queryClient, ...rest } = options ?? {}

  return render(ui, { wrapper: createWrapper(queryClient), ...rest })
}

export const renderHookWithProviders = <Result, Props>(hook: (props: Props) => Result, options?: Omit<RenderHookOptions<Props>, "wrapper"> & { queryClient?: QueryClient }) => {
  const { queryClient, ...rest } = options ?? {}

  return renderHook(hook, { wrapper: createWrapper(queryClient), ...rest })
}

export const flush = async (rounds = 3): Promise<void> => {
  for (let round = 0; round < rounds; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}
