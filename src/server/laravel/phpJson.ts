function escapeForPhp(json: string): string {
  return json.replace(/[/\u007f-￿]/g, (character) => {
    if (character === "/") return "\\/"
    if (character === "\u007f") return character
    return "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0")
  })
}

export function phpJsonEncode(value: unknown, options: { pretty?: boolean } = {}): string {
  return escapeForPhp(options.pretty ? JSON.stringify(value, null, 4) : JSON.stringify(value))
}
