import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function ConfirmPhrase({ id, phrase, value, onValueChange }: { id: string; phrase: string; value: string; onValueChange: (value: string) => void }) {
  return (
    <Field>
      <FieldLabel htmlFor={id} required>Escriba «{phrase}» para confirmar</FieldLabel>
      <Input id={id} value={value} autoComplete="off" spellCheck={false} aria-required="true" onChange={(event) => onValueChange(event.target.value)} />
    </Field>
  )
}
