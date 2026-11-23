import type { FichaProposalValue as ProposalValue } from "@/api/ficha-imports"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export function FichaProposalValue({ value, label }: { value: ProposalValue; label: string }) {
  if (typeof value === "object" && !Array.isArray(value)) {
    return (
      <Table label={label}>
        <TableHeader>
          <TableRow>
            {value.columns.map((column, index) => (
              <TableHead key={index} scope="col">
                {column}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {value.rows.map((row, index) => (
            <TableRow key={index}>
              {row.map((cell, column) => (
                <TableCell key={column} data-label={value.columns[column]}>
                  {cell || "—"}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  if (Array.isArray(value)) {
    return (
      <ul className="list-disc pl-5">
        {value.map((line, index) => (
          <li key={index} className="whitespace-pre-wrap">
            {line}
          </li>
        ))}
      </ul>
    )
  }

  return <p className="whitespace-pre-wrap">{value}</p>
}
