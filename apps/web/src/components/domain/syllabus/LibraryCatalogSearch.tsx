"use client"

import { Search } from "lucide-react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { type CatalogBook, type CatalogSearchField } from "@/api/libraryCatalog"
import { FeedbackAlert } from "@/components/domain/FeedbackAlert"
import { TablePagination } from "@/components/domain/TablePagination"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useOpened } from "@/composables/useModelOpen"
import { catalogErrorMessage } from "@/lib/blocks/catalog"
import { useSchemaForm } from "@/lib/forms"
import { failedQuery, sameKey } from "@/lib/queryClient"
import { catalogSearchQuery } from "@/queries/libraryCatalog"
import { catalogSearchSchema } from "@silabos/shared/schemas/library"
import type { PaginationMeta } from "@/types/pagination"

type Query = { field: CatalogSearchField; text: string }

const SEARCH_FIELDS: CatalogSearchField[] = ["any", "title", "author", "isbn"]
const TERM_CHARACTERS = 120
const searchSchema = catalogSearchSchema(SEARCH_FIELDS, TERM_CHARACTERS).pick({ field: true, q: true })
const EMPTY_SEARCH = { field: "any", q: "" }

const EMPTY_META: PaginationMeta = { current_page: 1, last_page: 1, per_page: 20, from: null, to: null, total: 0 }

export function LibraryCatalogSearch({ disabled = false, onPick }: { disabled?: boolean; onPick: (book: CatalogBook) => void }) {
  const [open, setOpen] = useState(false)
  const form = useSchemaForm(searchSchema, { defaultValues: EMPTY_SEARCH })
  const field = (form.watch("field") ?? "any") as CatalogSearchField
  const text = String(form.watch("q") ?? "")
  const [searched, setSearched] = useState<Query | null>(null)
  const [page, setPage] = useState(1)
  const [added, setAdded] = useState<Set<string>>(() => new Set())
  const query = useQuery({ ...catalogSearchQuery(searched?.field ?? "any", searched?.text ?? "", page), enabled: searched !== null, placeholderData: keepPreviousData })
  const busy = query.isFetching
  const error = searched && failedQuery(query) ? catalogErrorMessage(query.error) : null
  const results: CatalogBook[] | null = searched && !error ? (query.data?.data ?? null) : null
  const meta: PaginationMeta | null = searched && !error ? (query.data?.meta ?? null) : null
  useOpened(open, () => {
    form.reset(EMPTY_SEARCH)
    setSearched(null)
    setPage(1)
    setAdded(new Set())
  })

  const search = form.handleSubmit(({ field: chosen, q }) => {
    const trimmed = String(q ?? "").trim()
    if (trimmed.length < 2 || busy) return
    const next = { field: chosen as CatalogSearchField, text: trimmed }
    if (sameKey(next, searched) && page === 1) {
      void query.refetch()
      return
    }
    setSearched(next)
    setPage(1)
  })
  const goTo = (next: number): void => {
    if (searched && !busy) setPage(next)
  }
  const pick = (book: CatalogBook): void => {
    onPick(book)
    setAdded((current) => new Set(current).add(book.id))
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="w-fit" disabled={disabled}>
          <Search data-icon="inline-start" aria-hidden="true" />
          Buscar en la biblioteca
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-(--overlay-max-height) flex-col gap-3 overflow-hidden sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Buscar en la biblioteca</DialogTitle>
          <DialogDescription>Elija un libro para agregarlo a la tabla</DialogDescription>
        </DialogHeader>
        <form className="flex flex-wrap gap-2" onSubmit={(event) => void search(event)} noValidate>
          <NativeSelect value={field} aria-label="Buscar por" onChange={(event) => form.setValue("field", event.target.value)}>
            <NativeSelectOption value="any">Todo</NativeSelectOption>
            <NativeSelectOption value="title">Título</NativeSelectOption>
            <NativeSelectOption value="author">Autor</NativeSelectOption>
            <NativeSelectOption value="isbn">ISBN</NativeSelectOption>
          </NativeSelect>
          <Input value={text} className="min-w-40 flex-1" maxLength={120} placeholder="Texto a buscar" aria-label="Texto a buscar" onChange={(event) => form.setValue("q", event.target.value)} />
          <Button type="submit" disabled={busy || text.trim().length < 2}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            Buscar
          </Button>
        </form>
        {error ? (
          <FeedbackAlert message={error} />
        ) : results !== null ? (
          <ScrollArea className="min-h-0 flex-1">
            <Table label="Libros de la biblioteca" cards={false}>
              <TableHeader>
                <TableRow>
                  <TableHead>Autor</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-center">Año</TableHead>
                  <TableHead>Ciudad</TableHead>
                  <TableHead>Editorial</TableHead>
                  <TableHead>ISBN</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>
                    <span className="sr-only">Agregar</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.length === 0 ? (
                  <TableEmpty colSpan={9}>No hay resultados</TableEmpty>
                ) : (
                  results.map((book) => (
                    <TableRow key={book.id}>
                      <TableCell className="whitespace-normal">{book.author}</TableCell>
                      <TableCell className="whitespace-normal font-medium">{book.title}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{book.kind}</Badge>
                      </TableCell>
                      <TableCell className="text-center">{book.year}</TableCell>
                      <TableCell className="whitespace-normal">{book.place}</TableCell>
                      <TableCell className="whitespace-normal">{book.publisher}</TableCell>
                      <TableCell>{book.isbn}</TableCell>
                      <TableCell className="whitespace-normal">{book.format}</TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="sm"
                          variant={added.has(book.id) ? "outline" : "default"}
                          disabled={added.has(book.id)}
                          aria-label={`Agregar ${book.title}`}
                          onClick={() => pick(book)}
                        >
                          {added.has(book.id) ? "Agregado" : "Agregar"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        ) : null}
        {results !== null && !error ? (
          <div className="shrink-0">
            <TablePagination meta={meta ?? EMPTY_META} label="Paginación de los libros" onPageChange={goTo} />
          </div>
        ) : null}
        <DialogFooter className="shrink-0">
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
