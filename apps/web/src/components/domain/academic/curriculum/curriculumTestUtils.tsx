import { act } from "@testing-library/react"
import { createContext, useContext, type ReactNode } from "react"

const SelectContext = createContext<(value: string) => void>(() => undefined)

export const selectStub = {
  Select: ({ onValueChange, children }: { value?: string; onValueChange?: (value: string) => void; children?: ReactNode }) => (
    <SelectContext.Provider value={onValueChange ?? (() => undefined)}>
      <div data-select>{children}</div>
    </SelectContext.Provider>
  ),
  SelectTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectValue: () => <span />,
  SelectContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectLabel: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  SelectItem: function SelectItem({ value, children }: { value: string; children?: ReactNode }) {
    const choose = useContext(SelectContext)

    return (
      <div data-value={value} onClick={() => choose(value)}>
        {children}
      </div>
    )
  },
}

export const flushMicrotasks = async (rounds = 5): Promise<void> => {
  for (let round = 0; round < rounds; round += 1) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}
