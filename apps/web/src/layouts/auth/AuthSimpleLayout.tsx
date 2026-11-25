import type { ReactNode } from "react"
import { AppLogoIcon } from "@/components/AppLogoIcon"
import { AppearanceToggle } from "@/components/AppearanceToggle"

export function AuthSimpleLayout({ title, description, children }: { title?: string; description?: string; children: ReactNode }) {
  return (
    <main id="contenido" tabIndex={-1} className="relative flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 outline-hidden md:p-10">
      <div className="absolute top-4 right-4"><AppearanceToggle /></div>
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col items-center gap-4">
            <div className="flex flex-col items-center gap-2 font-medium">
              <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-md"><AppLogoIcon className="size-9 object-contain" /></div>
            </div>
            <div className="flex flex-col gap-2 text-center">
              <h1 className="text-xl font-medium">{title}</h1>
              <p className="text-center text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
          {children}
        </div>
      </div>
    </main>
  )
}
