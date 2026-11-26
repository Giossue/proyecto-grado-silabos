"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { ApiError } from "@/api/client"
import { logout, resendActivation } from "@/api/session"
import { TextLink } from "@/components/TextLink"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { AuthSplitLayout } from "@/layouts/auth/AuthSplitLayout"
import { clearIntendedRoute } from "@/lib/intended-route"
import { paths } from "@/lib/routes"
import { toast } from "@/lib/toast"
import { sessionState } from "@/state/session"

export default function VerifyEmailPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  const resend = async (): Promise<void> => {
    setProcessing(true)
    setError(null)
    try {
      toast.success((await resendActivation()).message)
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "No se pudo reenviar el enlace de activación")
    } finally {
      setProcessing(false)
    }
  }

  const closeSession = async (): Promise<void> => {
    const result = await logout()
    sessionState.clear()
    clearIntendedRoute()
    if (result?.logout_url) window.location.assign(result.logout_url)
    else router.replace(paths.login)
  }

  return (
    <AuthSplitLayout title="Cuenta sin activar" description="Active su cuenta con el enlace que le enviamos a su correo">
      {error ? <FeedbackAlert message={error} /> : null}

      <div className="flex flex-col gap-6 text-center">
        <Button type="button" disabled={processing} variant="secondary" onClick={() => void resend()}>
          {processing ? <Spinner /> : null}
          Reenviar enlace de activación
        </Button>

        <TextLink as="button" className="mx-auto block text-sm" onClick={() => void closeSession()}>
          Cerrar sesión
        </TextLink>
      </div>
    </AuthSplitLayout>
  )
}
