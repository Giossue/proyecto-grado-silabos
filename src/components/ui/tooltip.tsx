"use client"

import * as React from "react"
import { cn } from "cn"
import { Tooltip as TooltipPrimitive } from "radix-ui"

const HOLD_MS = 450
const SHOW_MS = 1600
const TOUCH_QUERY = "(hover: none) and (pointer: coarse)"

type TooltipTouchState = {
  touch: boolean
  setHeld: (held: boolean) => void
}

const TooltipTouchContext = React.createContext<TooltipTouchState | null>(null)

const hasMatchMedia = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"

const subscribeTouch = (notify: () => void): (() => void) => {
  if (!hasMatchMedia()) return () => undefined
  const media = window.matchMedia(TOUCH_QUERY)
  media.addEventListener("change", notify)
  return () => media.removeEventListener("change", notify)
}

const touchSnapshot = (): boolean =>
  hasMatchMedia() && window.matchMedia(TOUCH_QUERY).matches

function useTouchScreen(): boolean {
  return React.useSyncExternalStore(subscribeTouch, touchSnapshot, () => false)
}

const ignoreOpenChange = (): void => undefined

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  open,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const touch = useTouchScreen()
  const [held, setHeld] = React.useState(false)
  const state = React.useMemo(() => ({ touch, setHeld }), [touch])

  return (
    <TooltipTouchContext.Provider value={state}>
      <TooltipPrimitive.Root
        data-slot="tooltip"
        {...props}
        open={touch ? held : open}
        onOpenChange={touch ? ignoreOpenChange : onOpenChange}
      />
    </TooltipTouchContext.Provider>
  )
}

function TooltipTrigger({
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  onContextMenu,
  onClickCapture,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  const state = React.useContext(TooltipTouchContext)
  const holdTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  const hideTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  const longPressed = React.useRef(false)
  const held = React.useRef(false)
  const setHeld = state?.setHeld

  const dismiss = React.useCallback(() => {
    clearTimeout(hideTimer.current)
    held.current = false
    setHeld?.(false)
  }, [setHeld])

  React.useEffect(
    () => () => {
      clearTimeout(holdTimer.current)
      clearTimeout(hideTimer.current)
      document.removeEventListener("pointerdown", dismiss, { capture: true })
    },
    [dismiss]
  )

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    onPointerDown?.(event)
    if (!state?.touch || event.pointerType === "mouse") return
    longPressed.current = false
    clearTimeout(holdTimer.current)
    clearTimeout(hideTimer.current)
    holdTimer.current = setTimeout(() => {
      longPressed.current = true
      held.current = true
      state.setHeld(true)
      document.addEventListener("pointerdown", dismiss, {
        once: true,
        capture: true,
      })
    }, HOLD_MS)
  }

  const endPress = () => {
    clearTimeout(holdTimer.current)
    if (held.current) hideTimer.current = setTimeout(dismiss, SHOW_MS)
  }

  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      {...props}
      onPointerDown={handlePointerDown}
      onPointerUp={(event) => {
        onPointerUp?.(event)
        endPress()
      }}
      onPointerCancel={(event) => {
        onPointerCancel?.(event)
        endPress()
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event)
        endPress()
      }}
      onContextMenu={(event) => {
        onContextMenu?.(event)
        if (state?.touch) event.preventDefault()
      }}
      onClickCapture={(event) => {
        onClickCapture?.(event)
        if (!longPressed.current) return
        longPressed.current = false
        event.preventDefault()
        event.stopPropagation()
      }}
    />
  )
}

function TooltipContent({
  className,
  sideOffset = 4,
  collisionPadding = 8,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "bg-foreground text-background",
          "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit rounded-md px-3 py-1.5 text-xs",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
