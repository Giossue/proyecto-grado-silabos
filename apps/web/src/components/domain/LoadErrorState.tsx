import { RefreshCw } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

export function LoadErrorState({ message, title, onRetry }: { message: string; title?: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title ?? "No se pudo cargar esta información"}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>{message}</span>
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw data-icon="inline-start" aria-hidden="true" />
          Reintentar
        </Button>
      </AlertDescription>
    </Alert>
  )
}
