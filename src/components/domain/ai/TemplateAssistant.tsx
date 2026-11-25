"use client"

import { Check, MessageSquarePlus, Send, Trash2 } from "lucide-react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { ApiError } from "@/api/client"
import { clearTemplateAssistant, sendTemplateAssistantMessage, type TemplateAssistantChat, type TemplateAssistantDraft, type TemplateAssistantMessage, type TemplateProposalStatus } from "@/api/templateAssistant"
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation"
import { Message, MessageContent } from "@/components/ai-elements/message"
import { RobotAvatar } from "@/components/domain/ai/avatar/RobotAvatar"
import { useAvatarController } from "@/components/domain/ai/avatar/useAvatarController"
import { renderChatMarkdown } from "@/components/domain/ai/chatMarkdown"
import { IconTooltip } from "@/components/domain/IconTooltip"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { attemptKey } from "@/lib/attemptKey"
import { useSchemaForm } from "@/lib/forms"
import { VALIDATION_LIMITS } from "@/lib/validationLimits"
import { isAssistantPending, templateAssistantKeys, templateAssistantQuery } from "@/queries/templateAssistant"
import { assistantMessageSchema } from "@/schemas/template"

type TemplateAssistantProps = {
  refresh: number
  draftVersion: string
  snapshot: () => TemplateAssistantDraft
  busy: string | null
  onApply: (proposalId: string) => void
  onDiscard: (proposalId: string) => void
}

type Proposal = NonNullable<TemplateAssistantMessage["proposal"]>

const STATUS_LABELS: Record<Exclude<TemplateProposalStatus, "pendiente">, string> = {
  aplicada: "Aplicada",
  descartada: "Descartada",
  vencida: "Vencida: el borrador cambió",
  reemplazada: "Reemplazada por otra propuesta",
}

const messageSchema = assistantMessageSchema(VALIDATION_LIMITS.longText)

const failure = (reason: unknown, fallback: string): string => (reason instanceof ApiError ? (Object.values(reason.errors).flat()[0] ?? reason.message) : fallback)

export function TemplateAssistant({ refresh, draftVersion, snapshot, busy, onApply, onDiscard }: TemplateAssistantProps) {
  const queryClient = useQueryClient()
  const query = useQuery({ ...templateAssistantQuery(refresh), placeholderData: keepPreviousData })
  const chat: TemplateAssistantChat | null = query.data ?? null
  const form = useSchemaForm(messageSchema, { defaultValues: { message: "" } })
  const message = String(form.watch("message") ?? "")
  const loading = query.isFetching
  const [actionError, setActionError] = useState<string | null>(null)
  const error = actionError ?? (query.isError ? failure(query.error, "No se pudo cargar la conversación") : null)
  const [engaged, setEngaged] = useState(false)
  const [messageKey] = useState(attemptKey)
  const refreshChat = (): Promise<unknown> => queryClient.invalidateQueries({ queryKey: templateAssistantKeys.all })
  const sending = useMutation({
    mutationFn: (text: string) => sendTemplateAssistantMessage(text, snapshot(), messageKey.use(text)),
    onSuccess: async () => {
      messageKey.reset()
      form.reset({ message: "" })
      await refreshChat()
    },
    onError: (reason) => setActionError(failure(reason, "No se pudo enviar el pedido")),
  })

  const messages = chat?.messages ?? []
  const waiting = sending.isPending || isAssistantPending(chat)
  const received = messages.filter((item) => item.role === "asistente" && item.status === "completado").length
  const avatar = useAvatarController({ userEngaged: engaged, awaitingModel: waiting, receivedCount: received })
  const trimmed = message.trim()
  const canSend = chat?.available === true && !loading && !waiting && trimmed.length > 0 && trimmed.length <= VALIDATION_LIMITS.longText
  const canRestart = !waiting && messages.length > 0
  const proposalStatus = (proposal: Proposal): TemplateProposalStatus => (proposal.status === "pendiente" && proposal.draft_version !== draftVersion ? "vencida" : proposal.status)
  const messageField = form.register("message")

  const send = form.handleSubmit(({ message: text }) => {
    if (!canSend) return
    setActionError(null)
    sending.mutate((text ?? "").trim())
  })
  const restart = async (): Promise<void> => {
    if (!canRestart) return
    setActionError(null)
    try {
      await clearTemplateAssistant()
      await refreshChat()
    } catch (reason) {
      setActionError(failure(reason, "No se pudo iniciar un nuevo chat"))
    }
  }

  return (
    <Card className="assistant-panel gap-0 overflow-hidden py-0">
      <CardHeader className="flex shrink-0 flex-row items-center gap-3 py-3">
        {messages.length ? <RobotAvatar {...avatar.state} className="h-10 w-12 shrink-0" /> : null}
        <CardTitle className="min-w-0 flex-1">Asistente de plantilla</CardTitle>
        <Button type="button" variant="outline" size="sm" disabled={!canRestart} onClick={() => void restart()}>
          <MessageSquarePlus data-icon="inline-start" aria-hidden="true" />
          Nuevo chat
        </Button>
      </CardHeader>
      <Separator />
      <Conversation aria-label="Conversación con el asistente de plantilla" className="min-h-0 flex-1">
        <ConversationContent className="gap-5 px-4 py-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {loading && !chat ? (
            <div role="status" aria-live="polite" aria-busy="true" aria-label="Cargando conversación">
              <span className="sr-only">Cargando conversación…</span>
              <Empty aria-hidden="true">
                <EmptyHeader>
                  <Skeleton className="h-28 w-36 rounded-full" />
                  <Skeleton className="h-6 w-56 max-w-full" />
                </EmptyHeader>
              </Empty>
            </div>
          ) : chat && !chat.available ? (
            <Alert>
              <AlertDescription>El asistente no está disponible por ahora</AlertDescription>
            </Alert>
          ) : chat?.locked ? (
            <Alert>
              <AlertDescription>Con la convocatoria abierta solo puede hacer consultas</AlertDescription>
            </Alert>
          ) : null}
          {chat && !messages.length ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia>
                  <RobotAvatar {...avatar.state} className="h-28 w-36" />
                </EmptyMedia>
                <EmptyTitle>Pida un cambio a la plantilla</EmptyTitle>
              </EmptyHeader>
              {chat.available ? (
                <EmptyContent>
                  {chat.suggestions.map((suggestion) => (
                    <Button key={suggestion} type="button" variant="outline" className="h-auto whitespace-normal text-left" disabled={waiting} onClick={() => form.setValue("message", suggestion)}>
                      {suggestion}
                    </Button>
                  ))}
                </EmptyContent>
              ) : null}
            </Empty>
          ) : null}
          {messages.map((item) => {
            const status = item.proposal ? proposalStatus(item.proposal) : null
            return (
              <Message key={item.id} from={item.role === "usuario" ? "user" : "assistant"} className="max-w-full min-w-0">
                <MessageContent className="max-w-full min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{item.role === "usuario" ? "Tú" : "Asistente"}</p>
                  {item.content && item.role === "asistente" ? (
                    <div className="flex flex-col gap-2 break-words">{renderChatMarkdown(item.content)}</div>
                  ) : item.content ? (
                    <p className="break-words whitespace-pre-wrap">{item.content}</p>
                  ) : null}
                  {item.status === "pendiente" || item.status === "en_ejecucion" ? (
                    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Spinner />
                      Preparando la propuesta…
                    </p>
                  ) : null}
                  {item.status === "fallido" ? (
                    <Alert variant="destructive">
                      <AlertDescription>{item.error ?? "No se pudo completar el pedido"}</AlertDescription>
                    </Alert>
                  ) : null}
                  {item.proposal && status ? (
                    <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3 text-sm" data-proposal>
                      <p className="font-medium">Cambios propuestos</p>
                      <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
                        {item.proposal.changes.map((change) => <li key={change}>{change.replace(/\.$/, "")}</li>)}
                      </ul>
                      {status === "pendiente" ? (
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" disabled={busy !== null} onClick={() => onApply(item.proposal!.id)}>
                            {busy === item.proposal.id ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" aria-hidden="true" />}
                            Aplicar
                          </Button>
                          <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => onDiscard(item.proposal!.id)}>
                            <Trash2 data-icon="inline-start" aria-hidden="true" />
                            Descartar
                          </Button>
                        </div>
                      ) : (
                        <Badge variant="secondary" className="self-start">{STATUS_LABELS[status]}</Badge>
                      )}
                    </div>
                  ) : null}
                </MessageContent>
              </Message>
            )
          })}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <Separator />
      <CardContent className="min-w-0 shrink-0 px-4 py-4">
        <form onSubmit={(event) => void send(event)} noValidate>
          <Field>
            <FieldLabel htmlFor="template-assistant-message" className="sr-only">Pedido al asistente</FieldLabel>
            <div className="flex items-end gap-2">
              <Textarea
                id="template-assistant-message"
                {...messageField}
                maxLength={VALIDATION_LIMITS.longText}
                rows={3}
                className="min-w-0 flex-1"
                disabled={!chat?.available || waiting}
                placeholder="¿Qué cambio quiere en la plantilla?"
                onFocus={() => setEngaged(true)}
                onBlur={(event) => {
                  setEngaged(false)
                  void messageField.onBlur(event)
                }}
              />
              <IconTooltip label="Enviar">
                <Button type="submit" size="icon" aria-label="Enviar" disabled={!canSend}>
                  {waiting ? <Spinner /> : <Send aria-hidden="true" />}
                </Button>
              </IconTooltip>
            </div>
            <FieldDescription>Los cambios aplicados se guardan con «Guardar»</FieldDescription>
          </Field>
        </form>
      </CardContent>
    </Card>
  )
}
