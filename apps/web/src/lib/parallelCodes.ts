const LETTERS = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));

const freeLetters = (parallels: ReadonlyArray<{ code: string }>): string[] => {
  const used = new Set(parallels.map((parallel) => parallel.code.trim().toUpperCase()));
  return LETTERS.filter((letter) => !used.has(letter));
};

export function nextParallelCode(parallels: ReadonlyArray<{ code: string }>): string {
  return freeLetters(parallels)[0] ?? '';
}

export function parallelCodeChoices(others: ReadonlyArray<{ code: string }>, current?: string): string[] {
  const letters = freeLetters(others);
  return current === undefined || letters.includes(current) ? letters : [current, ...letters];
}
