import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useState } from "react"
import { type CatalogLibrary } from "@/api/libraryCatalog"
import { errorMessage } from "@/lib/queryClient"
import { catalogLibrariesQuery } from "@/queries/libraryCatalog"

export const useCatalogLibraries = () => {
  const queryClient = useQueryClient()
  const [libraries, setLibraries] = useState<CatalogLibrary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<CatalogLibrary[] | null> => {
    setLibraries(null)
    setError(null)
    try {
      const found = await queryClient.fetchQuery(catalogLibrariesQuery())
      setLibraries(found)

      return found
    } catch (reason) {
      setError(errorMessage(reason, "No se pudo consultar la lista de bibliotecas"))

      return null
    }
  }, [queryClient])

  return { libraries, error, load }
}

export const initialLibraries = (saved: string[], known: CatalogLibrary[]): string[] => (saved.length === 0 ? known.map((library) => library.id) : [...saved])

export const librariesToStore = (chosen: string[], known: CatalogLibrary[]): string[] =>
  known.length > 0 && known.every((library) => chosen.includes(library.id)) ? [] : [...chosen]

export const sameLibraries = (first: string[], second: string[]): boolean => first.length === second.length && first.every((code) => second.includes(code))
