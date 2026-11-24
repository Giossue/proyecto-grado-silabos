import { elementsOf, parseHtml, serializeHtml, type HtmlElement } from "./html"

type Specificity = [number, number, number]

type Property = { name: string; value: string; specificity: Specificity | null }

type Rule = { selector: string; properties: Property[]; specificity: Specificity; order: number }

const CLASS_PATTERN =
  /(\.[\w]+)|\[(\w+)|(:(link|visited|active|hover|focus|lang|target|enabled|disabled|checked|indeterminate|root|nth-child|nth-last-child|nth-of-type|nth-last-of-type|first-child|last-child|first-of-type|last-of-type|only-child|only-of-type|empty|contains))/gi

const TYPE_PATTERN = /((^|[\s+>~]+)[\w]+|:{1,2}(after|before|first-letter|first-line|selection))/gi

function cleanup(css: string): string {
  return css
    .replace(/[\r\n]/g, "")
    .replace(/\t/g, " ")
    .replace(/"/g, "'")
    .replace(/\/\*.*?\*\//g, "")
    .replace(/\s\s+/g, " ")
    .trim()
}

function specificityOf(selector: string): Specificity {
  return [(selector.match(/#/g) ?? []).length, (selector.match(CLASS_PATTERN) ?? []).length, (selector.match(TYPE_PATTERN) ?? []).length]
}

function compareSpecificity(left: Specificity, right: Specificity): number {
  for (let index = 0; index < 3; index += 1) if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1
  return 0
}

function splitProperties(source: string): string[] {
  const parts = cleanup(source).replace(/;+$/, "").split(";")
  const properties: string[] = []
  for (let index = 0; index < parts.length; index += 1) {
    let property = parts[index].trim()
    if (parts[index + 1]?.trim().startsWith("base64,")) {
      property += `;${parts[index + 1].trim()}`
      index += 1
    }
    properties.push(property)
  }
  return properties
}

function toProperties(declarations: string[], specificity: Specificity | null): Property[] {
  return declarations.flatMap((declaration) => {
    const colon = declaration.indexOf(":")
    if (colon === -1) return []
    const value = declaration.slice(colon + 1).trim()
    return value === "" ? [] : [{ name: declaration.slice(0, colon).trim(), value, specificity }]
  })
}

export function cssRules(css: string): Rule[] {
  const cleaned = cleanup(css.replace(/@charset "[^"]+";/g, "").replace(/@media [^{]*{(?:[^{}]|{[^{}]*})*}/g, ""))
  return cleanup(cleaned)
    .replace(/}+$/, "")
    .split("}")
    .flatMap((chunk, index) => {
      const [selectors, declarations] = cleanup(chunk).split("{")
      if (declarations === undefined) return []
      return selectors
        .trim()
        .split(",")
        .map((raw) => {
          const selector = raw.trim()
          const specificity = specificityOf(selector)
          return { selector, properties: toProperties(splitProperties(declarations), specificity), specificity, order: index + 1 }
        })
    })
}

export function cssFromStyleTags(html: string): string {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "")
  return [...withoutComments.matchAll(/<style(?:\s[\s\S]*?)?>([\s\S]*?)<\/style>/gi)].map((match) => `${match[1].trim()}\n`).join("")
}

type Compound = { tag: string | null; classes: string[]; not: string[]; lastOfType: boolean }

type Step = { compound: Compound; combinator: " " | ">" }

function parseSelector(selector: string): Step[] | null {
  const steps: Step[] = []
  let combinator: " " | ">" = " "
  for (const token of selector.replace(/\s*>\s*/g, " > ").split(/\s+/)) {
    if (token === ">") {
      combinator = ">"
      continue
    }
    const match = /^(\*|[a-zA-Z][\w-]*)?((?:\.[\w-]+|:not\([a-zA-Z][\w-]*\)|:last-of-type)*)$/.exec(token)
    if (!match) return null
    const modifiers = match[2]
    steps.push({
      combinator,
      compound: {
        tag: match[1] && match[1] !== "*" ? match[1].toLowerCase() : null,
        classes: [...modifiers.matchAll(/\.([\w-]+)/g)].map((item) => item[1]),
        not: [...modifiers.matchAll(/:not\(([a-zA-Z][\w-]*)\)/g)].map((item) => item[1].toLowerCase()),
        lastOfType: modifiers.includes(":last-of-type"),
      },
    })
    combinator = " "
  }
  return steps
}

function matchesCompound(element: HtmlElement, compound: Compound): boolean {
  if (compound.tag && element.name !== compound.tag) return false
  if (compound.not.includes(element.name)) return false
  if (compound.classes.length > 0) {
    const classes = (element.attributes.find(([name]) => name === "class")?.[1] ?? "").split(/\s+/)
    if (!compound.classes.every((name) => classes.includes(name))) return false
  }
  if (compound.lastOfType && element.parent) {
    const siblings = element.parent.children.filter((child) => child.type === "element" && child.name === element.name)
    if (siblings[siblings.length - 1] !== element) return false
  }
  return true
}

function matches(element: HtmlElement, steps: Step[], index = steps.length - 1): boolean {
  if (!matchesCompound(element, steps[index].compound)) return false
  if (index === 0) return true
  let ancestor = element.parent
  if (steps[index].combinator === ">") return ancestor !== null && matches(ancestor, steps, index - 1)
  while (ancestor) {
    if (matches(ancestor, steps, index - 1)) return true
    ancestor = ancestor.parent
  }
  return false
}

function merge(properties: Property[], applied: Map<string, Property>): void {
  for (const property of properties) {
    const existing = applied.get(property.name)
    if (!existing) {
      applied.set(property.name, property)
      continue
    }
    const existingImportant = /!important/i.test(existing.value)
    const important = /!important/i.test(property.value)
    if (existingImportant && !important) continue
    const overrule = (!existingImportant && important) || compareSpecificity(existing.specificity as Specificity, property.specificity as Specificity) <= 0
    if (overrule) {
      applied.delete(property.name)
      applied.set(property.name, property)
    }
  }
}

function inlineOn(element: HtmlElement, applied: Map<string, Property>): void {
  const index = element.attributes.findIndex(([name]) => name === "style")
  const inline = new Map(toProperties(splitProperties(index === -1 ? "" : element.attributes[index][1]), null).map((property) => [property.name, property]))
  const merged = [...[...applied.values()].filter((property) => !inline.has(property.name)), ...inline.values()]
  const style = merged.map((property) => `${property.name}: ${property.value};`).join(" ")
  if (index === -1) element.attributes.push(["style", style])
  else element.attributes[index] = ["style", style]
}

export function inlineCss(html: string, css: string): string {
  const document = parseHtml(html)
  const rules = [...cssRules(cssFromStyleTags(html)), ...cssRules(css)].sort(
    (left, right) => compareSpecificity(left.specificity, right.specificity) || left.order - right.order,
  )
  const elements = elementsOf(document.root)
  const applied = new Map<HtmlElement, Map<string, Property>>()
  for (const rule of rules) {
    const steps = parseSelector(rule.selector)
    if (!steps || steps.length === 0) continue
    for (const element of elements) {
      if (!matches(element, steps)) continue
      if (!applied.has(element)) applied.set(element, new Map())
      merge(rule.properties, applied.get(element) as Map<string, Property>)
    }
  }
  for (const [element, properties] of applied) if (properties.size > 0) inlineOn(element, properties)
  return serializeHtml(document)
}
