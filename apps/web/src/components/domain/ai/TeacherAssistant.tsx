"use client"

import { Lightbulb, RotateCcw, Send, X } from "lucide-react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { ApiError } from "@/api/client"
import { discardTeacherProposal, sendTeacherAssistantMessage, type TeacherAssistantChat, type TeacherAssistantMessage, type TeacherProposal } from "@/api/teacherAssistant"
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation"
import { Message, MessageContent } from "@/components/ai-elements/message"
import { RobotAvatar } from "@/components/domain/ai/avatar/RobotAvatar"
import { useAvatarController } from "@/components/domain/ai/avatar/useAvatarController"
import { renderChatMarkdown } from "@/components/domain/ai/chatMarkdown"
import { TeacherProposalCard, type ProposalAction, type ProposalOutcome } from "@/components/domain/ai/TeacherProposalCard"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { errorMessages, useSchemaForm } from "@/lib/forms"
import { toast } from "@/lib/toast"
import { withoutFinalPeriod } from "@/lib/utils"
import { assistantFailure, PROPOSAL_GONE, teacherAssistantKeys } from "@/queries/teacherAssistant"
import { TEACHER_ASSISTANT_MESSAGE_MAX, teacherAssistantRequestSchema } from "@silabos/shared/schemas/syllabus"

export type { ProposalOutcome }

const SUGGESTIONS = [
  "Mejore la redacción de lo que ya escribí",
  "¿Qué me recomienda en los campos vacíos?",
  "Compare mis textos con las horas y semanas",
]

const UNAVAILABLE = "El asistente no está disponible por ahora. Puede seguir editando su sílabo"
const SEND_FAILURE = { fallback: "No se pudo enviar el pedido. Revise su conexión e inténtelo de nuevo", missing: "No encontramos este sílabo. Recargue la página" }
const DISCARD_FAILURE = { fallback: "No se pudo descartar la propuesta. Inténtelo de nuevo", missing: PROPOSAL_GONE }

const messageSchema = teacherAssistantRequestSchema().pick({ message: true })

const forbidden = (reason: unknown): boolean => reason instanceof ApiError && reason.status === 403

const remainingText = (remaining: number): string => (remaining === 1 ? "Le queda 1 pedido hoy" : `Le quedan ${remaining} pedidos hoy`)

const questionBefore = (messages: TeacherAssistantMessage[], index: number): string | null =>
  messages.slice(0, index).findLast((item) => item.role === "usuario")?.content ?? null

const announce = (proposal: TeacherProposal, outcome: ProposalOutcome): void => {
  if (!outcome.applied) toast.error(outcome.reason)
  else if (outcome.saveProblem !== null) toast.error(`La propuesta se colocó en «${proposal.field_label}», pero no se pudo guardar: ${outcome.saveProblem}`)
  else toast.success(`Propuesta colocada en «${proposal.field_label}»`)
}

type Request = { text: string; typed: boolean }

type TeacherAssistantProps = {
  syllabusId: string
  chat: TeacherAssistantChat | null
  open: boolean
  waitingElsewhere: boolean
  onOpenChange: (open: boolean) => void
  onBeforeSend: () => Promise<unknown>
  onForbidden: () => void
  onUse: (proposal: TeacherProposal) => Promise<ProposalOutcome>
  hasField: (fieldId: string) => boolean
  onShowField: (fieldId: string) => void
}

export function TeacherAssistant({ syllabusId, chat, open, waitingElsewhere, onOpenChange, onBeforeSend, onForbidden, onUse, hasField, onShowField }: TeacherAssistantProps) {
  const queryClient = useQueryClient()
  const form = useSchemaForm(messageSchema, { defaultValues: { message: "" } })
  const messageField = form.register("message")
  const messageErrors = errorMessages(form.formState.errors.message)
  const [sendProblem, setSendProblem] = useState<string | null>(null)
  const [working, setWorking] = useState<{ id: string; action: ProposalAction } | null>(null)
  const [outcomes, setOutcomes] = useState<Record<string, ProposalOutcome | null>>({})
  const [engaged, setEngaged] = useState(false)
  const [wasOpen, setWasOpen] = useState(open)
  const openNow = useRef(open)
  const opener = useRef<HTMLElement | null>(null)
  const fieldToShow = useRef<string | null>(null)

  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setOutcomes({})
      setSendProblem(null)
    }
  }

  useEffect(() => {
    openNow.current = open
  }, [open])

  const refresh = (): Promise<void> => queryClient.invalidateQueries({ queryKey: teacherAssistantKeys.chat(syllabusId) })
  const sending = useMutation({
    mutationFn: async ({ text }: Request) => {
      await onBeforeSend()
      return sendTeacherAssistantMessage(syllabusId, text, crypto.randomUUID())
    },
    onMutate: () => setSendProblem(null),
    onSuccess: async (_result, { text, typed }) => {
      if (typed && String(form.getValues("message") ?? "").trim() === text) form.reset({ message: "" })
      await refresh()
    },
    onError: async (reason, { typed }) => {
      if (forbidden(reason)) {
        onForbidden()
        return
      }
      const invalid = reason instanceof ApiError && reason.status === 422 ? reason.errors.message?.[0] : undefined
      if (invalid && typed) form.setError("message", { type: "server", message: invalid }, { shouldFocus: true })
      else setSendProblem(assistantFailure(reason, SEND_FAILURE))
      await refresh()
    },
  })

  const available = chat?.available === true ? chat : null
  const messages = available?.messages ?? []
  const busy = available?.busy === true
  const waitingAnswer = sending.isPending || busy
  const received = messages.filter((item) => item.role === "asistente" && item.status === "completado").length
  const avatar = useAvatarController({ userEngaged: engaged, awaitingModel: waitingAnswer, receivedCount: received })
  const exhausted = available !== null && available.remaining <= 0

  const send = form.handleSubmit(({ message }) => {
    if (!waitingAnswer) sending.mutate({ text: String(message).trim(), typed: true })
  })

  const remember = (id: string, outcome: ProposalOutcome | null): void => setOutcomes((current) => ({ ...current, [id]: outcome }))

  const use = async (proposal: TeacherProposal): Promise<void> => {
    setWorking({ id: proposal.id, action: "usar" })
    remember(proposal.id, null)
    const outcome = await onUse(proposal)
    remember(proposal.id, outcome)
    if (!openNow.current) announce(proposal, outcome)
    await refresh()
    setWorking(null)
  }

  const discard = async (proposal: TeacherProposal): Promise<void> => {
    setWorking({ id: proposal.id, action: "descartar" })
    remember(proposal.id, null)
    try {
      await discardTeacherProposal(syllabusId, proposal.id)
    } catch (reason) {
      if (forbidden(reason)) {
        onForbidden()
        return
      }
      remember(proposal.id, { applied: false, reason: assistantFailure(reason, DISCARD_FAILURE) })
    }
    await refresh()
    setWorking(null)
  }

  const showField = (fieldId: string): void => {
    fieldToShow.current = fieldId
    onOpenChange(false)
  }

  const suggest = (suggestion: string): void => {
    form.setValue("message", suggestion)
    form.setFocus("message")
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        dismissable
        className="top-0 right-0 left-auto h-dvh max-h-dvh w-full max-w-full translate-x-0 translate-y-0 gap-0 rounded-none pt-[env(safe-area-inset-top)] sm:max-w-md data-[state=closed]:slide-out-to-right data-[state=closed]:zoom-out-100 data-[state=open]:slide-in-from-right data-[state=open]:zoom-in-100"
        onEscapeKeyDown={() => onOpenChange(false)}
        onOpenAutoFocus={() => {
          opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          const fieldId = fieldToShow.current
          fieldToShow.current = null
          if (fieldId) onShowField(fieldId)
          else opener.current?.focus()
        }}
      >
        <SheetHeader className="shrink-0 flex-row flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
          <RobotAvatar {...avatar.state} className="h-9 w-11 shrink-0" />
          <SheetTitle className="flex-1 whitespace-nowrap">Asistente IA</SheetTitle>
          <SheetClose asChild>
            <Button type="button" variant="outline" size="sm" className="ml-auto">
              <X data-icon="inline-start" aria-hidden="true" />
              Cerrar
            </Button>
          </SheetClose>
        </SheetHeader>
        <Conversation aria-label="Conversación con el asistente" className="min-h-24 flex-1">
          <ConversationContent scrollClassName="[scrollbar-gutter:auto]!" className="gap-5 px-4 py-4">
            {available && !messages.length ? (
              <Empty className="justify-start gap-3 p-0 md:p-0">
                <EmptyHeader className="max-w-full">
                  <EmptyTitle>¿Con qué le ayudo?</EmptyTitle>
                </EmptyHeader>
                {exhausted ? null : (
                  <EmptyContent className="max-w-full gap-2" data-suggestions>
                    {SUGGESTIONS.map((suggestion) => (
                      <Button key={suggestion} type="button" variant="outline" className="h-auto w-full justify-start py-2 text-left whitespace-normal" onClick={() => suggest(suggestion)}>
                        <Lightbulb data-icon="inline-start" aria-hidden="true" />
                        {suggestion}
                      </Button>
                    ))}
                  </EmptyContent>
                )}
              </Empty>
            ) : null}
            {messages.map((item, index) => {
              const retry = index === messages.length - 1 && item.role === "asistente" && item.status === "fallido" ? questionBefore(messages, index) : null
              return (
                <Message key={item.id} from={item.role === "usuario" ? "user" : "assistant"} className={item.role === "usuario" ? "max-w-[85%] min-w-0" : "max-w-full min-w-0"}>
                  <MessageContent className={item.role === "usuario" ? "max-w-full min-w-0" : "w-full max-w-full min-w-0"}>
                    <p className="text-xs font-medium text-muted-foreground">{item.role === "usuario" ? "Usted" : "Asistente"}</p>
                    {item.content && item.role === "asistente" ? (
                      <div className="flex flex-col gap-2 break-words">{renderChatMarkdown(item.content)}</div>
                    ) : item.content ? (
                      <p className="break-words whitespace-pre-wrap">{item.content}</p>
                    ) : null}
                    {item.status === "pendiente" || item.status === "en_ejecucion" ? (
                      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Spinner />
                        Preparando la respuesta…
                      </p>
                    ) : null}
                    {item.status === "fallido" ? (
                      <Alert variant="destructive">
                        <AlertDescription>{withoutFinalPeriod(item.error ?? "No se pudo completar el pedido")}</AlertDescription>
                      </Alert>
                    ) : null}
                    {retry && !busy && !exhausted && available ? (
                      <Button type="button" variant="outline" size="sm" className="w-fit" disabled={sending.isPending} onClick={() => sending.mutate({ text: retry, typed: false })}>
                        {sending.isPending ? <Spinner data-icon="inline-start" /> : <RotateCcw data-icon="inline-start" aria-hidden="true" />}
                        Intentar de nuevo
                      </Button>
                    ) : null}
                    {item.proposals.map((proposal) => (
                      <TeacherProposalCard
                        key={proposal.id}
                        proposal={proposal}
                        outcome={outcomes[proposal.id] ?? null}
                        working={working?.id === proposal.id ? working.action : null}
                        waiting={working !== null || waitingElsewhere}
                        fieldOnScreen={hasField(proposal.field_id)}
                        onUse={() => void use(proposal)}
                        onDiscard={() => void discard(proposal)}
                        onShowField={() => showField(proposal.field_id)}
                      />
                    ))}
                  </MessageContent>
                </Message>
              )
            })}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
        <div className="flex shrink-0 flex-col gap-3 border-t px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {!available ? (
            <Alert>
              <AlertDescription>{UNAVAILABLE}</AlertDescription>
            </Alert>
          ) : exhausted ? (
            <Alert>
              <AlertDescription>Llegó al límite de {available.limit} pedidos de hoy al asistente. Podrá pedir otra vez mañana</AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={(event) => void send(event)} noValidate className="flex flex-col gap-3">
              {sendProblem ? (
                <Alert variant="destructive">
                  <AlertDescription>{sendProblem}</AlertDescription>
                </Alert>
              ) : null}
              <Field data-invalid={Boolean(messageErrors)}>
                <FieldLabel htmlFor="teacher-assistant-message" className="sr-only">Su pedido al asistente</FieldLabel>
                <Textarea
                  id="teacher-assistant-message"
                  {...messageField}
                  rows={2}
                  maxLength={TEACHER_ASSISTANT_MESSAGE_MAX}
                  className="max-h-32 resize-none"
                  placeholder="Escriba lo que necesita"
                  aria-invalid={Boolean(messageErrors)}
                  onFocus={() => setEngaged(true)}
                  onBlur={(event) => {
                    setEngaged(false)
                    void messageField.onBlur(event)
                  }}
                />
                <FieldError errors={messageErrors} />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <p className="text-xs text-muted-foreground" aria-live="polite">{remainingText(available.remaining)}</p>
                <Button type="submit" className="ml-auto" disabled={waitingAnswer}>
                  {waitingAnswer ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" aria-hidden="true" />}
                  Enviar pedido
                </Button>
              </div>
            </form>
          )}
  <SheetDescription className="text-center text-xs leading-snug">La IA (DeepSeek) puede equivocarse: revise antes de usar y no escriba datos personales.</SheetDescription>
        </div>
      </SheetContent>
    </Sheet>
  )
}
