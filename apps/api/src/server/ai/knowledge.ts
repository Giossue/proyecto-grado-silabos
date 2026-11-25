import knowledge from "./templateKnowledge.json"

export function templateSystemPrompt(): string {
  const parts = [...knowledge.files]
    .sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)))
    .map((file) => file.content.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, ""))
  if (parts.length === 0) throw new Error("Falta el contexto del asistente en resources/ai/plantilla.")
  return parts.join("\n\n")
}
