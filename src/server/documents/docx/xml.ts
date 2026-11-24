const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

const TEXT_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "\r": "&#13;" }
const ATTRIBUTE_ESCAPES: Record<string, string> = { ...TEXT_ESCAPES, "\n": "&#10;", "\t": "&#9;" }

export function xmlDocument(body: string): string {
  return XML_DECLARATION + body
}

export function escapeText(value: string): string {
  return value.replace(/[&<>"\r]/g, (character) => TEXT_ESCAPES[character])
}

export function escapeDomText(value: string): string {
  return value.replace(/[&<>\r]/g, (character) => TEXT_ESCAPES[character])
}

export function escapeAttribute(value: string): string {
  return value.replace(/[&<>"\r\n\t]/g, (character) => ATTRIBUTE_ESCAPES[character])
}

export function controlCharacters(value: string): string {
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x13]/g, (character) => `_x${character.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}_`)
}

export function attributeNumber(value: number): string {
  return String(value)
}

export function phpPrecision(value: number): string {
  return String(Number(value.toPrecision(14)))
}

export function element(name: string, attributes: [string, string | number][] = [], children = ""): string {
  const rendered = attributes.map(([key, value]) => ` ${key}="${escapeAttribute(typeof value === "number" ? attributeNumber(value) : value)}"`).join("")
  return children === "" ? `<${name}${rendered}/>` : `<${name}${rendered}>${children}</${name}>`
}
