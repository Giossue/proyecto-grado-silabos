import { isRecord, type PhpRecord } from "./phpValues"
import { definitionError } from "./templateStyle"

type Blocks = Record<string, PhpRecord>

const PLAIN = ["string", "number"]

function entry(raw: unknown, key: string): unknown {
  return isRecord(raw) && Object.prototype.hasOwnProperty.call(raw, key) ? raw[key] : undefined
}

function entries(raw: unknown): [string, PhpRecord][] {
  return isRecord(raw) ? (Object.entries(raw) as [string, PhpRecord][]) : []
}

function rowColumns(schema: unknown): PhpRecord | null {
  const items = entry(schema, "items")
  const properties = entry(items, "properties")
  return entry(schema, "type") === "array" && entry(items, "type") === "object" && isRecord(properties) ? properties : null
}

export function inheritsRows(value: unknown): boolean {
  return entries(value).some(([, schema]) => entry(schema, "rows_from") !== undefined)
}

export function withoutRowIds(value: unknown): unknown {
  if (!entries(value).some(([, schema]) => entry(schema, "row_ids") !== undefined)) return value
  return Object.fromEntries(entries(value).map(([key, schema]) => [key, withoutFlag(schema)]))
}

function withoutFlag(schema: PhpRecord): PhpRecord {
  return Object.fromEntries(Object.entries(schema).filter(([name]) => name !== "row_ids"))
}

function checkLoose(schema: PhpRecord, where: string): void {
  if (schema.rows_from !== undefined) definitionError(`${where}.filas_desde: solo la usa una lista principal de la tabla, con columnas.`)
  if (schema.copy_of !== undefined) definitionError(`${where}.desde: solo se usa en una columna de una lista con «filas_desde».`)
  checkChildren(schema, where)
}

function checkChildren(schema: PhpRecord, where: string): void {
  for (const [key, child] of entries(schema.properties)) checkLoose(child, `${where}.campos.${key}`)
  const columns = rowColumns(schema)
  if (columns !== null) for (const [key, child] of entries(columns)) checkLoose(child, `${where}.columnas.${key}`)
  else if (isRecord(schema.items)) checkLoose(schema.items, `${where}.columnas`)
}

function sourceColumns(blocks: Blocks, kind: string, reference: string, where: string): PhpRecord {
  const [table, listKey] = reference.split(".")
  if (table === kind) definitionError(`${where}: una lista no puede tomar filas de su propia tabla.`)
  const block = entry(blocks, table)
  if (block === undefined) definitionError(`${where}: la tabla «${table}» no existe en la plantilla.`)
  const list = entry(entry(block, "value"), listKey)
  const columns = rowColumns(list)
  if (columns === null) definitionError(`${where}: la tabla «${table}» no tiene una lista de filas «${listKey}».`)
  if (entry(list, "rows_from") !== undefined) definitionError(`${where}: la lista «${reference}» ya toma sus filas de otra tabla.`)
  return columns
}

function checkInherited(blocks: Blocks, kind: string, schema: PhpRecord, columns: PhpRecord, where: string): string {
  const reference = String(schema.rows_from)
  const source = sourceColumns(blocks, kind, reference, `${where}.filas_desde`)
  if (Number(schema.minItems) > 0 || Number(schema.initial) > 0) {
    const key = Number(schema.minItems) > 0 ? "filas" : "al_empezar"
    definitionError(`${where}.${key}: una lista con «filas_desde» no pide filas propias: use un mínimo de 0 y no ponga «al_empezar» mayor que 0.`)
  }
  for (const [key, column] of entries(columns)) {
    const columnWhere = `${where}.columnas.${key}`
    if (column.rows_from !== undefined) checkLoose(column, columnWhere)
    if (column.copy_of !== undefined) {
      if (!PLAIN.includes(String(column.type))) definitionError(`${columnWhere}.desde: solo va en una columna de un solo dato.`)
      const copied = String(column.copy_of)
      if (!PLAIN.includes(String(entry(entry(source, copied), "type")))) {
        definitionError(`${columnWhere}.desde: la lista «${reference}» no tiene una columna de un solo dato «${copied}».`)
      }
    }
    checkChildren(column, columnWhere)
  }
  return reference
}

function sourceLists(blocks: Blocks): Set<string> {
  const sources = new Set<string>()
  for (const [kind, block] of entries(blocks)) {
    for (const [key, schema] of entries(block.value)) {
      const where = `blocks.${kind}.campos.${key}`
      const columns = rowColumns(schema)
      if (schema.rows_from === undefined || columns === null) {
        checkLoose(schema, where)
        continue
      }
      if (schema.copy_of !== undefined) definitionError(`${where}.desde: solo se usa en una columna de una lista con «filas_desde».`)
      sources.add(checkInherited(blocks, kind, schema, columns, where))
      if (entry(block.catalog, "list") === key) definitionError(`blocks.${kind}.catalogo.lista: una lista con «filas_desde» no admite libros del catálogo.`)
    }
  }
  return sources
}

function marked(kind: string, block: PhpRecord, sources: Set<string>): PhpRecord {
  let changed = false
  const fields = entries(block.value).map(([key, schema]): [string, PhpRecord] => {
    const wanted = sources.has(`${kind}.${key}`)
    if (wanted === (schema.row_ids === true)) return [key, schema]
    changed = true
    return [key, wanted ? { ...schema, row_ids: true } : withoutFlag(schema)]
  })
  return changed ? { ...block, value: Object.fromEntries(fields) } : block
}

export function linkedBlocks(blocks: Blocks): Blocks {
  const sources = sourceLists(blocks)
  return Object.fromEntries(Object.entries(blocks).map(([kind, block]) => [kind, marked(kind, block, sources)]))
}
