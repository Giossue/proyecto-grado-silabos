export type GridCell = { span: number; width: number }

export function columnWidths(rows: GridCell[][]): number[] {
  const edges = new Map<number, number>()
  for (const cells of rows) {
    let column = 0
    let position = 0
    for (const cell of cells) {
      column += Math.max(1, cell.span)
      position += cell.width
      if (!edges.has(column)) edges.set(column, position)
    }
  }
  if (edges.size === 0) return []
  const count = Math.max(...edges.keys())
  const widths: number[] = []
  let previous = 0
  for (let column = 1; column <= count; column++) {
    if (!edges.has(column)) {
      let next = column + 1
      while (!edges.has(next)) next++
      edges.set(column, previous + Math.trunc(((edges.get(next) as number) - previous) / (next - column + 1)))
    }
    const edge = edges.get(column) as number
    widths.push(Math.max(1, edge - previous))
    previous = Math.max(previous, edge)
  }
  return widths
}
