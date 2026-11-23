import { FieldError } from "@/components/ui/field"

export function InputError({ id, message, className }: { id?: string; message?: string; className?: string }) {
  return message ? <FieldError id={id} className={className} errors={[message]} /> : null
}
