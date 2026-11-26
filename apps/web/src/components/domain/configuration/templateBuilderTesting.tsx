import { act, fireEvent, render } from "@testing-library/react"
import { createRef, type ComponentProps } from "react"
import { expect, vi } from "vitest"
import { TemplateVisualBuilder, type TemplateVisualBuilderHandle } from "@/components/domain/configuration/TemplateVisualBuilder"
import { createWrapper } from "@/test/render"

type BuilderProps = Omit<ComponentProps<typeof TemplateVisualBuilder>, "ref">

export const settle = async (rounds = 4): Promise<void> => {
  for (let round = 0; round < rounds; round += 1) {
    await act(async () => {
      if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0)
      else await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

export const body = (): HTMLElement => document.body
export const byText = (selector: string, text: string): HTMLElement | undefined =>
  [...body().querySelectorAll<HTMLElement>(selector)].find((element) => element.textContent?.trim() === text)
export const byLabel = (label: string): HTMLButtonElement | null => body().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
export const click = async (element: Element | null | undefined): Promise<void> => {
  expect(element).toBeTruthy()
  fireEvent.click(element as Element)
  await settle()
}
export const press = async (element: Element | null | undefined, key = "Enter"): Promise<void> => {
  expect(element).toBeTruthy()
  fireEvent.keyDown(element as Element, { key })
  await settle()
}
export const typeInto = async (label: string, value: string): Promise<void> => {
  fireEvent.change(body().querySelector(`[aria-label="${label}"]`)!, { target: { value } })
  await settle()
}
export const selectField = async (id: string): Promise<void> => {
  fireEvent.pointerDown(body().querySelector(`[data-field-editor="${id}"]`)!)
  await settle()
}
export const selectSection = async (title: string): Promise<void> => {
  fireEvent.focusIn(body().querySelector(`[aria-label="Sección ${title}"]`)!)
  await settle()
}
export const menuItems = (): HTMLElement[] => [...body().querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]')]
export const chooseMenuItem = async (text: string): Promise<void> => {
  await click(menuItems().find((item) => item.textContent?.trim() === text))
}

export const startEditing = async (handle: { current: TemplateVisualBuilderHandle | null }): Promise<void> => {
  act(() => handle.current!.askEdit())
  await settle()
}

export const mountBuilder = async (props: BuilderProps, { edit = true }: { edit?: boolean } = {}) => {
  const handle = createRef<TemplateVisualBuilderHandle>()
  const callbacks = { onChanged: vi.fn(), onDirty: vi.fn(), onEditing: vi.fn() }
  const element = (next: Partial<BuilderProps> = {}) => <TemplateVisualBuilder ref={handle} {...callbacks} {...props} {...next} />
  const view = render(element(), { wrapper: createWrapper() })
  await settle()
  if (edit && !props.processLock) await startEditing(handle)

  return {
    handle,
    ...callbacks,
    payload: () => handle.current!.payload(),
    rerender: async (next: Partial<BuilderProps>) => {
      view.rerender(element(next))
      await settle()
    },
    unmount: view.unmount,
  }
}
