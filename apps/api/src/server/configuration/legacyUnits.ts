import { isRecord, type PhpRecord } from "./phpValues"

const KIND = "unidades"
const OLD = "units"
const PATH_KEYS = ["count", "filled", "sum"]
const OLD_PATH = /^units(?=\.|$)/
const OLD_REPEAT = /(data-repeat=['"]\{\s*(?:"|&quot;)value(?:"|&quot;)\s*:\s*(?:"|&quot;))units(?=(?:"|&quot;)\s*\})/g

function renamedKey(value: unknown): unknown {
  if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, OLD) || Object.prototype.hasOwnProperty.call(value, KIND)) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key === OLD ? KIND : key, item]))
}

function renamedPaths(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(renamedPaths)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, PATH_KEYS.includes(key) && typeof item === "string" ? item.replace(OLD_PATH, KIND) : renamedPaths(item)]),
  )
}

function renamedLayout(value: unknown): unknown {
  if (typeof value === "string") return value.replace(OLD_REPEAT, `$1${KIND}`)
  if (Array.isArray(value)) return value.map(renamedLayout)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, key === "repeat" && isRecord(item) && item.value === OLD ? { ...item, value: KIND } : renamedLayout(item)]),
  )
}

function renamedCatalog(value: unknown): unknown {
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, (key === "list" || key === "lista") && item === OLD ? KIND : item]))
}

function hasOldList(value: unknown): boolean {
  return renamedKey(value) !== value
}

export function legacyUnitsBlock(kind: string, raw: unknown): unknown {
  if (kind !== KIND || !isRecord(raw) || !(hasOldList(raw.value) || hasOldList(raw.campos))) return raw
  const renamed: PhpRecord = {}
  for (const [key, item] of Object.entries(raw)) {
    if (key === "value" || key === "campos") renamed[key] = renamedKey(item)
    else if (key === "rules" || key === "reglas") renamed[key] = renamedPaths(item)
    else if (key === "layout" || key === "diseño") renamed[key] = renamedLayout(item)
    else if (key === "catalog" || key === "catalogo") renamed[key] = renamedCatalog(item)
    else renamed[key] = item
  }
  return renamed
}

export function legacyUnitsDocument(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(legacyUnitsDocument)
  if (!isRecord(node)) return node
  if (node.type === "documentBlock" && isRecord(node.attrs) && node.attrs.kind === KIND && hasOldList(node.attrs.value)) {
    return { ...node, attrs: { ...node.attrs, value: renamedKey(node.attrs.value) } }
  }
  return Array.isArray(node.content) ? { ...node, content: node.content.map(legacyUnitsDocument) } : node
}
