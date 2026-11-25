import { InputError } from "@/components/InputError"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type TeacherFormationFieldProps = {
  id?: string
  value: string
  onValueChange: (value: string) => void
  error?: string
  hideHint?: boolean
}

export function TeacherFormationField({ id = "formation", value, onValueChange, error, hideHint = false }: TeacherFormationFieldProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} required>
        Formación y experiencia académica-investigativa
      </Label>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className="min-h-40"
        name="formacion_experiencia"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        placeholder="Ej. Ingeniero en Sistemas, Magíster en…; cátedras impartidas…; proyectos de investigación…"
      />
      {!hideHint ? (
        <p className="text-sm text-muted-foreground">La escribe una sola vez: todos sus sílabos la copian. Si la cambia, se actualizan los sílabos que aún no ha enviado</p>
      ) : null}
      <InputError id={`${id}-error`} message={error} />
    </div>
  )
}
