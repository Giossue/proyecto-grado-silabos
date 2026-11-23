import type { SyllabusStateCounts } from "@/api/processes"
import { syllabusStateLabel } from "@/lib/syllabusStates"

export function SyllabusStateCountsTable({ counts, caption, total }: { counts: SyllabusStateCounts; caption: string; total?: number }) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <tbody>
        {Object.entries(counts).map(([state, count]) => (
          <tr key={state}>
            <th scope="row" className="py-1 text-left font-medium">
              {syllabusStateLabel(state)}
            </th>
            <td className="py-1 text-right tabular-nums">{count}</td>
          </tr>
        ))}
        {total !== undefined ? (
          <tr className="border-t">
            <th scope="row" className="py-1 text-left font-semibold">
              Total
            </th>
            <td className="py-1 text-right font-semibold tabular-nums">{total}</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  )
}
