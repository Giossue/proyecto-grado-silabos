import { Card, CardFooter, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

type LoadingSkeletonProps = {
  variant: "workspace"
  workspaceCount?: number
}

export function LoadingSkeleton({ workspaceCount = 3 }: LoadingSkeletonProps) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-6" role="status" aria-live="polite" aria-busy="true" aria-label="Cargando contenido">
      <span className="sr-only">Cargando contenido…</span>
      <div aria-hidden="true" className="contents">
        <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-6 p-4 sm:p-6">
          <div className="flex min-w-0 flex-col gap-2">
            <Skeleton className="h-8 w-72 max-w-full" />
            <Skeleton className="h-5 w-112 max-w-full" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: Math.max(1, workspaceCount) }, (_, index) => (
              <Card key={index} className="h-full min-w-0">
                <CardHeader className="gap-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </CardHeader>
                <CardFooter className="mt-auto"><Skeleton className="h-9 w-full" /></CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
