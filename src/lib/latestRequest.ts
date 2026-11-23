import { useEffect, useState } from "react"

export type LatestRequest = {
  begin: () => number
  isCurrent: (ticket: number) => boolean
  cancel: () => void
}

export const latestRequest = (): LatestRequest => {
  let current = 0

  return {
    begin: (): number => (current += 1),
    isCurrent: (ticket: number): boolean => ticket === current,
    cancel: (): void => {
      current += 1
    },
  }
}

export const useLatestRequest = (): LatestRequest => {
  const [requests] = useState(latestRequest)

  useEffect(() => () => requests.cancel(), [requests])

  return requests
}
