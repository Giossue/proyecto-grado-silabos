"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

export function FacultyLogoPreview({ url, name }: { url: string; name: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Ver el logo en grande"
          className="flex h-24 min-w-0 flex-1 cursor-zoom-in items-center justify-center rounded-md border bg-background p-2 outline-hidden transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Logo actual de la facultad" className="max-h-full max-w-full object-contain" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Logo de {name}</DialogTitle>
          <DialogDescription>Así se verá en los sílabos</DialogDescription>
        </DialogHeader>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={`Logo de ${name}`} className="max-h-160 w-full object-contain" />
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cerrar
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
