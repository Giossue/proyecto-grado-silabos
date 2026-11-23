import type { ComponentProps, ReactNode } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

type AlertProps = ComponentProps<typeof Alert>

type FeedbackAlertProps = {
  message: string
  title?: string
  variant?: AlertProps["variant"]
  appearance?: AlertProps["appearance"]
  className?: string
  children?: ReactNode
}

export function FeedbackAlert({ message, title, variant = "destructive", appearance = "default", className, children }: FeedbackAlertProps) {
  return (
    <Alert variant={variant} appearance={appearance} className={className}>
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      <AlertDescription>{message}{children}</AlertDescription>
    </Alert>
  )
}
