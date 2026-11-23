import { useCallback, useState } from "react"
import { ApiError } from "@/api/client"
import { updateFormation } from "@/api/session"
import { toast } from "@/lib/toast"
import { sessionState, useSession } from "@/state/session"

export const useTeacherFormation = () => {
  const saved = useSession().session?.user.formation ?? ""
  const [formation, setFormation] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const changed = formation.trim() !== saved && formation.trim() !== ""

  const reset = useCallback((): void => {
    setFormation(sessionState.current.value?.user.formation ?? "")
    setError(undefined)
  }, [])

  const save = async (): Promise<boolean> => {
    setSaving(true)
    setError(undefined)
    try {
      sessionState.replace(await updateFormation(formation))
      toast.success("Formación y experiencia guardadas")

      return true
    } catch (reason) {
      const message =
        reason instanceof ApiError ? (reason.errors.formacion_experiencia?.[0] ?? reason.message) : "No se pudo guardar la formación y experiencia"
      setError(message)
      toast.error(message)

      return false
    } finally {
      setSaving(false)
    }
  }

  return { formation, setFormation, saving, error, changed, reset, save }
}
