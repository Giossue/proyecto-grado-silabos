"use client"

import * as React from "react"
import { cn } from "cn"
import { Dialog as DialogPrimitive } from "radix-ui"
import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { withoutFinalPeriodText } from "@/components/ui/plain-text"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type DialogCloseContextValue = {
  enabled: boolean
  register: () => () => void
}

const DialogCloseContext = React.createContext<DialogCloseContextValue | null>(
  null
)

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

const preventDefault = (event: Event): void => {
  event.preventDefault()
}

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogCloseButton({ className }: { className?: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogPrimitive.Close
            data-slot="dialog-close-x"
            aria-label="Cerrar"
            className={cn(
              "focus-visible:ring-ring/50 focus-visible:ring-3 outline-hidden absolute inline-flex size-8 items-center justify-center rounded-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none",
              className
            )}
          >
            <XIcon className="size-4" aria-hidden="true" />
            <span className="sr-only">Cerrar</span>
          </DialogPrimitive.Close>
        </TooltipTrigger>
        <TooltipContent>Cerrar</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-overlay/40 backdrop-blur-sm duration-200",
        className
      )}
      {...props}
    />
  )
}

type DialogLayer = "default" | "confirmation"

const layerClass = (layer: DialogLayer): string =>
  layer === "confirmation" ? "z-(--layer-confirmation)" : "z-(--layer-modal)"

function DialogContent({
  className,
  children,
  overlayClassName,
  layer = "default",
  hideClose = false,
  onEscapeKeyDown,
  onOpenAutoFocus,
  onInteractOutside,
  onPointerDownOutside,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  overlayClassName?: string
  layer?: DialogLayer
  hideClose?: boolean
}) {
  const [titles, setTitles] = React.useState(0)
  const unsaved = React.useRef(false)
  const register = React.useCallback(() => {
    setTitles((count) => count + 1)
    return () => setTitles((count) => count - 1)
  }, [])
  const closeContext = React.useMemo(
    () => ({ enabled: !hideClose, register }),
    [hideClose, register]
  )
  const markChanged = () => {
    unsaved.current = true
  }

  return (
    <DialogPortal>
      <DialogOverlay className={cn(layerClass(layer), overlayClassName)} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-card text-card-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid grid-cols-[minmax(0,1fr)] max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] overflow-y-auto translate-x-[-50%] translate-y-[-50%] gap-4 rounded-md ring-1 ring-surface-ring p-6 shadow-modal duration-200 sm:max-w-lg",
          className,
          layerClass(layer)
        )}
        onEscapeKeyDown={(event) => {
          onEscapeKeyDown?.(event)
          if (unsaved.current) event.preventDefault()
        }}
        onOpenAutoFocus={(event) => {
          onOpenAutoFocus?.(event)
          const content =
            event.currentTarget instanceof HTMLElement
              ? event.currentTarget
              : null
          if (event.defaultPrevented || !content) return
          const first = [
            ...content.querySelectorAll<HTMLElement>(FOCUSABLE),
          ].find(
            (element) =>
              element.dataset.slot !== "dialog-close-x" &&
              !element.closest('[hidden], [inert], [aria-hidden="true"]')
          )
          if (!first) return
          event.preventDefault()
          first.focus({ preventScroll: true })
        }}
        onInteractOutside={(event) => {
          onInteractOutside?.(event)
          event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          onPointerDownOutside?.(event)
          event.preventDefault()
        }}
        {...props}
      >
        <DialogCloseContext.Provider value={closeContext}>
          <div
            className="contents"
            onInputCapture={markChanged}
            onChangeCapture={markChanged}
          >
            {children}
          </div>
        </DialogCloseContext.Provider>
        {!hideClose && titles === 0 && (
          <DialogCloseButton className="top-4 right-4" />
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogScrollContent({
  className,
  children,
  onEscapeKeyDown,
  onInteractOutside,
  onPointerDownOutside,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-overlay/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
        <DialogPrimitive.Content
          className={cn(
            "relative z-50 grid grid-cols-[minmax(0,1fr)] w-full max-w-lg my-8 gap-4 ring-1 ring-surface-ring bg-card text-card-foreground p-6 shadow-modal duration-200 sm:rounded-md md:w-full",
            className
          )}
          onEscapeKeyDown={(event) => {
            onEscapeKeyDown?.(event)
            preventDefault(event)
          }}
          onInteractOutside={(event) => {
            onInteractOutside?.(event)
            preventDefault(event)
          }}
          onPointerDownOutside={(event) => {
            onPointerDownOutside?.(event)
            preventDefault(event)
          }}
          {...props}
        >
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Overlay>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex flex-col gap-2 text-center [&_ul]:text-left [&_ol]:text-left",
        className
      )}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-6 flex flex-col-reverse gap-2 border-t px-6 pt-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  close = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title> & {
  close?: boolean
}) {
  const context = React.useContext(DialogCloseContext)
  const ownsClose = context !== null && close
  const register = context?.register

  React.useLayoutEffect(() => {
    if (ownsClose && register) return register()
  }, [ownsClose, register])

  const title = (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("px-8 text-lg leading-none font-semibold", className)}
      {...props}
    />
  )

  if (!ownsClose) return title

  return (
    <div data-slot="dialog-title-row" className="relative w-full self-stretch">
      {title}
      {context.enabled && (
        <DialogCloseButton className="top-1/2 -right-2 -translate-y-1/2" />
      )}
    </div>
  )
}

function DialogDescription({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    >
      {withoutFinalPeriodText(children)}
    </DialogPrimitive.Description>
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogScrollContent,
  DialogTitle,
  DialogTrigger,
}
