import { ascii } from "../signatures/holderMatcher"

export type PhpKey = string | number

const UNICODE_SPACES = /[   -   　]/g
const INTEGER_KEY = /^(0|-?[1-9]\d*)$/

export function importKey(value: string): string {
  const text = ascii(value.replace(UNICODE_SPACES, " ")).toLowerCase()
  return text.replace(/^[\s﻿​‎]+|[\s﻿​‎]+$/gu, "").replace(/(\s|ㅤ|ᅠ)+/gu, " ")
}

export function phpKey(key: string): PhpKey {
  if (!INTEGER_KEY.test(key)) return key
  const number = Number(key)
  return Number.isSafeInteger(number) ? number : key
}

export class PhpMap<V> {
  readonly entries = new Map<PhpKey, V>()

  set(key: string, value: V): this {
    this.entries.set(phpKey(key), value)
    return this
  }

  get(key: string): V | undefined {
    return this.entries.get(phpKey(key))
  }

  has(key: string): boolean {
    return this.entries.has(phpKey(key))
  }

  static merge<V>(...maps: PhpMap<V>[]): PhpMap<V> {
    const merged = new PhpMap<V>()
    let next = 0
    for (const map of maps) {
      for (const [key, value] of map.entries) {
        if (typeof key === "number") merged.entries.set(next++, value)
        else merged.entries.set(key, value)
      }
    }
    return merged
  }
}

export function phpIsNumeric(value: string): boolean {
  return /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[ \t\n\r\v\f]*$/.test(value)
}

export function phpIntValue(value: string): number {
  const match = /^[ \t\n\r\v\f]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(value)
  if (!match) return 0
  return /[.eE]/.test(match[0]) ? Math.trunc(Number(match[0].trim())) : Number(match[0].trim())
}

export function ctypeDigit(value: string): boolean {
  return /^\d+$/.test(value)
}

export function phpLength(value: string): number {
  return [...value].length
}
