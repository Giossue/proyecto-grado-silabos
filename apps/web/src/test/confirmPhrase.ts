import { fireEvent } from "@testing-library/react"

export const typeConfirmation = (id: string, phrase: string): void => {
  const input = document.body.querySelector<HTMLInputElement>(`#${id}`)
  if (!input) throw new Error(`No está el campo de confirmación #${id}`)
  fireEvent.change(input, { target: { value: phrase } })
}
