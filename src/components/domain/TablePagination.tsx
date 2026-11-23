"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination"
import type { PaginationMeta } from "@/types/pagination"

type PageItem = { type: "page"; value: number } | { type: "ellipsis" }

const range = (start: number, end: number): number[] => Array.from({ length: end - start + 1 }, (_, index) => index + start)

const pageItems = (currentPage: number, pageCount: number, siblingCount = 1): PageItem[] => {
  const firstPage = 1
  const lastPage = pageCount
  const leftSibling = Math.max(currentPage - siblingCount, firstPage)
  const rightSibling = Math.min(currentPage + siblingCount, lastPage)
  const totalPageNumbers = Math.min(2 * siblingCount + 5, pageCount)
  const itemCount = totalPageNumbers - 2
  const showLeftEllipsis = leftSibling > firstPage + 2 && Math.abs(lastPage - itemCount - firstPage + 1) > 2 && Math.abs(leftSibling - firstPage) > 2
  const showRightEllipsis = rightSibling < lastPage - 2 && Math.abs(lastPage - itemCount) > 2 && Math.abs(lastPage - rightSibling) > 2
  const pages = (values: number[]): PageItem[] => values.map((value) => ({ type: "page", value }))
  const ellipsis: PageItem = { type: "ellipsis" }

  if (!showLeftEllipsis && showRightEllipsis) return [...pages(range(1, itemCount)), ellipsis, ...pages([lastPage])]
  if (showLeftEllipsis && !showRightEllipsis) return [...pages([firstPage]), ellipsis, ...pages(range(lastPage - itemCount + 1, lastPage))]
  if (showLeftEllipsis && showRightEllipsis) return [...pages([firstPage]), ellipsis, ...pages(range(leftSibling, rightSibling)), ellipsis, ...pages([lastPage])]

  return pages(range(firstPage, lastPage))
}

type TablePaginationProps = {
  meta: PaginationMeta
  label?: string
  onPageChange: (page: number) => void
}

export function TablePagination({ meta, label = "Paginación de la tabla", onPageChange }: TablePaginationProps) {
  const pageCount = Math.max(1, Math.ceil(meta.total / Math.max(1, meta.per_page)))
  const changePage = (page: number): void => {
    if (page === meta.current_page || page < 1 || page > meta.last_page) return
    onPageChange(page)
  }

  return (
    <div className="-mt-2 flex items-center justify-between gap-3">
      <p className="text-pagination text-muted-foreground" aria-live="polite">
        {meta.from ?? 0}–{meta.to ?? 0} de {meta.total}
      </p>
      <Pagination aria-label={label} className="mx-0 w-auto justify-end">
        <PaginationContent className="flex-wrap">
          <li>
            <PaginationPrevious
              type="button"
              aria-label="Página anterior"
              className="h-7.5 text-pagination"
              disabled={meta.current_page <= 1}
              onClick={() => changePage(meta.current_page - 1)}
            >
              <ChevronLeft className="size-3.75" aria-hidden="true" />
              <span className="hidden sm:inline">Anterior</span>
            </PaginationPrevious>
          </li>
          <li className="px-2 text-pagination sm:hidden">
            Página {meta.current_page} de {meta.last_page}
          </li>
          {pageItems(meta.current_page, pageCount).map((item, index) =>
            item.type === "page" ? (
              <PaginationItem key={index} className="hidden sm:inline-flex">
                <PaginationLink
                  type="button"
                  isActive={item.value === meta.current_page}
                  aria-current={item.value === meta.current_page ? "page" : undefined}
                  aria-label={`Ir a la página ${item.value}`}
                  className="size-7.5 text-pagination"
                  onClick={() => changePage(item.value)}
                >
                  {item.value}
                </PaginationLink>
              </PaginationItem>
            ) : (
              <li key={index} className="hidden sm:flex">
                <PaginationEllipsis className="size-7.5 [&_svg]:size-3.75" />
              </li>
            ),
          )}
          <li>
            <PaginationNext
              type="button"
              aria-label="Página siguiente"
              className="h-7.5 text-pagination"
              disabled={meta.current_page >= pageCount}
              onClick={() => changePage(meta.current_page + 1)}
            >
              <span className="hidden sm:inline">Siguiente</span>
              <ChevronRight className="size-3.75" aria-hidden="true" />
            </PaginationNext>
          </li>
        </PaginationContent>
      </Pagination>
    </div>
  )
}
