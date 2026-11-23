export function nextParallelCode(parallels: ReadonlyArray<{ code: string }>): string {
  const used = new Set(parallels.map((parallel) => parallel.code.trim().toUpperCase()));
  for (let index = 0; index < 26; index++) {
    const code = String.fromCharCode(65 + index);
    if (!used.has(code)) return code;
  }
  return '';
}
