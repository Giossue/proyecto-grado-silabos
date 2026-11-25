import { vi } from "vitest"

export const keepClosingDialogs = (): void => {
  const real = window.getComputedStyle.bind(window)
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const style = real(element, pseudo)

    return new Proxy(style, {
      get: (target, key) => {
        if (key === "animationName") return element.getAttribute("data-state") === "closed" ? "exit" : "none"
        const value: unknown = Reflect.get(target, key)

        return typeof value === "function" ? value.bind(target) : value
      },
    })
  })
}

export const buttonWithText = (text: string, root: ParentNode = document.body): HTMLButtonElement | undefined =>
  [...root.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === text)

export const buttonContaining = (text: string, root: ParentNode = document.body): HTMLButtonElement | undefined =>
  [...root.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes(text))

export const buttonNamed = (label: string, root: ParentNode = document.body): HTMLButtonElement | undefined =>
  [...root.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.getAttribute("aria-label") === label || button.textContent?.trim() === label)
