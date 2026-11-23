import { FieldError } from "@/components/ui/field"

export function InputError({ message, className }: { message?: string; className?: string }) {
  return message ? <FieldError className={className} errors={[message]} /> : null
}
