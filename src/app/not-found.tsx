import { House } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { paths } from "@/lib/routes"

export default function NotFound() {
  return (
    <ScrollArea data-app-scroll className="h-dvh">
      <main id="contenido" tabIndex={-1} className="flex min-h-svh outline-hidden items-center justify-center bg-background px-6 py-12">
        <section className="flex w-full max-w-md flex-col gap-4 text-center">
          <p className="text-sm font-medium text-muted-foreground">Error 404</p>
          <h1 className="text-2xl font-semibold tracking-tight">Página no encontrada</h1>
          <Button asChild>
            <Link href={paths.dashboard}><House data-icon="inline-start" aria-hidden="true" />Volver a Inicio</Link>
          </Button>
        </section>
      </main>
    </ScrollArea>
  )
}
