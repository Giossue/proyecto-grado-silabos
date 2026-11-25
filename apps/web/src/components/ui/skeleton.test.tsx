import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Skeleton } from "@/components/ui/skeleton"

describe("Skeleton", () => {
  afterEach(cleanup)

  it("usa un color semántico neutral que se adapta a ambos temas", () => {
    const { container } = render(<Skeleton />)

    expect(
      container.querySelector('[data-slot="skeleton"]')?.classList
    ).toContain("bg-muted-foreground/25")
  })
})
