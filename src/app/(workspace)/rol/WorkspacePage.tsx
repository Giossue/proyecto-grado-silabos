"use client"

import { ArrowRight, CheckCircle2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { ApiError } from "@/api/client"
import { selectActiveRole, type ActiveRole } from "@/api/session"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { LoadErrorState } from "@/components/domain/LoadErrorState"
import { LoadingSkeleton } from "@/components/domain/LoadingSkeleton"
import { PageFrame } from "@/components/domain/PageFrame"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { consumeIntendedRoute } from "@/lib/intended-route"
import { roleLabel, scopeTitle } from "@/lib/roles"
import { paths, roleEntry } from "@/lib/routes"
import { sessionQuery, sessionState } from "@/state/session"

const selectionDescription = "Seleccione la carrera con la que trabajará en esta sesión"

const roleDescription = (role: ActiveRole): string => {
  if (role.code === "docente") return role.career_name ? "Docencia" : "Docencia en la carrera asignada"
  if (role.code === "coordinador") return role.career_name ? "Coordinación" : "Coordinación de la carrera asignada"
  if (role.code === "bibliotecario") return "Verificación de la bibliografía de los sílabos de todas las carreras"
  if (role.code === "administrador") return "Administración general del sistema"
  return role.career_name ? `${roleLabel(role.code)} · ${role.career_name}` : roleLabel(role.code)
}

export default function WorkspacePage() {
  const router = useRouter()
  const query = useQuery({ ...sessionQuery, staleTime: 0, refetchOnMount: "always" })
  const fresh = query.isFetchedAfterMount && !query.isError
  const session = fresh ? (query.data ?? null) : null
  const loadError = query.isError ? "No se pudo cargar su sesión" : null
  const routed = useRef(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [selectingRoleId, setSelectingRoleId] = useState<string | null>(null)
  const [workspaceCount] = useState(() => sessionState.current.value?.available_roles.length ?? 3)

  const actionLabel = (role: ActiveRole): string => {
    if (session?.active_role?.id === role.id) return "Continuar aquí"
    if (role.code === "coordinador" || role.code === "docente") return "Entrar a esta carrera"
    if (role.code === "bibliotecario") return "Entrar a Biblioteca"
    if (role.code === "administrador") return "Entrar como Administrador"
    return `Entrar como ${roleLabel(role.code)}`
  }

  useEffect(() => {
    if (!query.isFetchedAfterMount || query.isFetching || query.isError || routed.current) return
    routed.current = true
    const current = query.data ?? null
    if (!current) {
      router.replace(paths.login)
      return
    }
    if (!current.user.email_verified) {
      router.replace(paths.emailVerificationRequired)
      return
    }
    if (current.active_role) router.replace(consumeIntendedRoute() ?? roleEntry(current.active_role.code))
  }, [query.data, query.isError, query.isFetchedAfterMount, query.isFetching, router])

  const load = (): void => {
    void query.refetch()
  }

  const selectRole = async (roleAssignmentId: string): Promise<void> => {
    setActionError(null)
    setSelectingRoleId(roleAssignmentId)
    try {
      const selected = await selectActiveRole(roleAssignmentId)
      routed.current = true
      sessionState.replace(selected)
      router.replace(consumeIntendedRoute() ?? roleEntry(selected.active_role?.code))
    } catch (reason) {
      setActionError(reason instanceof ApiError ? reason.message : "No se pudo seleccionar el ámbito de trabajo")
    } finally {
      setSelectingRoleId(null)
    }
  }

  if (session) {
    return (
      <PageFrame title={`Hola, ${session.user.name}`} description={selectionDescription} size="wide">
        {actionError ? <FeedbackAlert message={actionError} /> : null}

        {session.available_roles.length === 0 ? (
          <Alert>
            <AlertTitle>No tiene asignaciones vigentes</AlertTitle>
            <AlertDescription>
              Contáctese con el coordinador de la carrera
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {session.available_roles.map((role) => (
              <Card key={role.id} className="h-full">
                <CardHeader>
                  <CardTitle>{role.code === "docente" ? (role.career_name ?? scopeTitle(role)) : scopeTitle(role)}</CardTitle>
                  {roleDescription(role) ? <CardDescription>{roleDescription(role)}</CardDescription> : null}
                  {session.active_role?.id === role.id ? (
                    <CardAction>
                      <Badge variant="secondary">
                        <CheckCircle2 aria-hidden="true" />
                        Activo
                      </Badge>
                    </CardAction>
                  ) : null}
                </CardHeader>
                <CardFooter className="mt-auto">
                  <Button className="w-full" type="button" disabled={selectingRoleId !== null} onClick={() => void selectRole(role.id)}>
                    {selectingRoleId === role.id ? <Spinner data-icon="inline-start" /> : <ArrowRight data-icon="inline-start" aria-hidden="true" />}
                    {actionLabel(role)}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </PageFrame>
    )
  }

  if (loadError) return <LoadErrorState message={loadError} onRetry={load} />
  if (!fresh || query.isFetching) return <LoadingSkeleton variant="workspace" workspaceCount={workspaceCount} />
  return null
}
