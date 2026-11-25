import { getCatalogLibraries, searchLibraryCatalog, type CatalogSearchField } from "@/api/libraryCatalog"

export const libraryCatalogKeys = {
  all: ["library-catalog"] as const,
  libraries: () => ["library-catalog", "libraries"] as const,
  search: (field: CatalogSearchField, text: string, page: number) => ["library-catalog", "search", field, text, page] as const,
}

export const catalogLibrariesQuery = () => ({ queryKey: libraryCatalogKeys.libraries(), queryFn: getCatalogLibraries, staleTime: 0 })

export const catalogSearchQuery = (field: CatalogSearchField, text: string, page: number) => ({
  queryKey: libraryCatalogKeys.search(field, text, page),
  queryFn: () => searchLibraryCatalog(field, text, page),
})
