const MINIMUM_WORDS = 2

const LETTERS: Record<string, string> = {
  ß: "ss", ẞ: "SS", æ: "ae", Æ: "AE", œ: "oe", Œ: "OE", ø: "o", Ø: "O", ł: "l", Ł: "L", đ: "d", Đ: "D", ð: "d", Ð: "D",
  þ: "th", Þ: "TH", ħ: "h", Ħ: "H", ı: "i", ĳ: "ij", Ĳ: "IJ", ŀ: "l", Ŀ: "L", ſ: "s", ŋ: "n", Ŋ: "N", ŧ: "t", Ŧ: "T",
}

export function ascii(name: string): string {
  return [...name.normalize("NFD")]
    .map((character) => LETTERS[character] ?? character)
    .join("")
    .replace(/[^\x00-\x7F]/g, "")
}

function words(name: string): string[] {
  const clean = ascii(name).toUpperCase().replace(/[^A-Z \t\n\v\f\r]/g, " ")
  const parts = clean.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, "").split(/[ \t\n\v\f\r]+/)
  return [...new Set(parts.filter((word) => word !== ""))]
}

export function holderMatches(certificateHolder: string, accountName: string): boolean {
  const holder = words(certificateHolder)
  const account = words(accountName)
  if (holder.length === 0 || account.length === 0) return false
  holder.sort()
  account.sort()
  return holder.length >= MINIMUM_WORDS && holder.length === account.length && holder.every((word, index) => word === account[index])
}
