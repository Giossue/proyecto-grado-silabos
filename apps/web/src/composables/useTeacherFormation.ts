import { useCallback } from "react"
import { ApiError } from "@/api/client"
import { updateFormation } from "@/api/session"
import { applyApiErrors, fieldMessage, serverMessage, useSchemaForm } from "@/lib/forms"
import { toast } from "@/lib/toast"
import { withoutFinalPeriod } from "@/lib/utils"
import { teacherFormationSchema } from "@silabos/shared/schemas/account"
import { sessionState, useSession } from "@/state/session"

const FIELD = "formacion_experiencia"
const FALLBACK = "No se pudo guardar la formación y experiencia"

export const useTeacherFormation = () => {
  const saved = useSession().session?.user.formation ?? ""
  const form = useSchemaForm(teacherFormationSchema, { defaultValues: { [FIELD]: "" } })
  const { errors, isSubmitting: saving } = form.formState
  const formation = form.watch(FIELD)
  const changed = formation.trim() !== saved && formation.trim() !== ""
  const error = fieldMessage(errors, FIELD) ?? serverMessage(errors)
  const { reset: resetForm, setValue } = form

  const setFormation = useCallback((value: string): void => setValue(FIELD, value), [setValue])

  const reset = useCallback((): void => {
    resetForm({ [FIELD]: sessionState.current.value?.user.formation ?? "" })
  }, [resetForm])

  const save = (): Promise<boolean> =>
    new Promise((resolve) => {
      void form.handleSubmit(
        async (values) => {
          try {
            sessionState.replace(await updateFormation(values[FIELD]))
            toast.success("Formación y experiencia guardadas")
            resolve(true)
          } catch (reason) {
            applyApiErrors(form.setError, reason, { fallback: FALLBACK })
            toast.error(reason instanceof ApiError ? (reason.errors[FIELD]?.[0] ?? reason.message) : FALLBACK)
            resolve(false)
          }
        },
        (invalid) => {
          const message = invalid[FIELD]?.message
          if (message) toast.error(withoutFinalPeriod(message))
          resolve(false)
        },
      )()
    })

  return { formation, setFormation, saving, error, changed, reset, save }
}
