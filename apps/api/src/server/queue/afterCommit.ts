export type AfterCommit = (callback: () => unknown) => void

export async function withAfterCommit<T>(transaction: (afterCommit: AfterCommit) => Promise<T>): Promise<T> {
  const callbacks: Array<() => unknown> = []
  const result = await transaction((callback) => void callbacks.push(callback))
  for (const callback of callbacks) await callback()
  return result
}
