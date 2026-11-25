"use client"

import Image from "next/image"
import type { ReactNode } from "react"
import { AppearanceToggle } from "@/components/AppearanceToggle"

export function AuthSplitLayout({ title, description, children }: { title?: string; description?: string; children: ReactNode }) {

  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-2">
      <div className="relative flex flex-col gap-4 p-6 md:p-10">
        <div className="flex items-center justify-end">
          <AppearanceToggle />
        </div>
        <main id="contenido" tabIndex={-1} className="flex flex-1 items-center justify-center outline-hidden">
          <div className="flex w-full max-w-sm flex-col gap-6">
            <div className="flex flex-col gap-2 text-center">
              {title ? <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1> : null}
              {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
            </div>
            {children}
          </div>
        </main>
      </div>
      <div className="relative hidden overflow-hidden bg-brand-surface text-brand-foreground lg:flex lg:items-center lg:justify-center">
        <Image
          src="/ueb-campus-login.webp"
          alt="Campus de la Universidad Estatal de Bolívar"
          width={1672}
          height={941}
          unoptimized
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-brand-surface/70" aria-hidden="true" />
        <div className="relative z-10 flex max-w-md flex-col gap-2 p-10 text-center">
          <p className="text-4xl font-semibold tracking-tight">Sílabos UEB</p>
          <p className="text-lg text-brand-foreground/90">
            Gestión de sílabos de la Universidad Estatal de Bolívar
          </p>
        </div>
      </div>
    </div>
  )
}
