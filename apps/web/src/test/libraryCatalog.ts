import type { CatalogBook, CatalogResults } from "@/api/libraryCatalog"

export const catalogResults = (data: CatalogBook[], total = data.length, page = 1): CatalogResults => ({
  data,
  meta: {
    current_page: page,
    last_page: Math.max(1, Math.ceil(total / 20)),
    per_page: 20,
    from: data.length === 0 ? null : (page - 1) * 20 + 1,
    to: data.length === 0 ? null : (page - 1) * 20 + data.length,
    total,
  },
})
