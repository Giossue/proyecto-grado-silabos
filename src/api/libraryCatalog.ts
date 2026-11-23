import { api } from '@/api/client';
import type { PaginationMeta } from '@/types/pagination';

export type CatalogSearchField = 'any' | 'title' | 'author' | 'isbn';
export type CatalogBook = {
    id: string;
    title: string;
    author: string;
    year: string;
    place: string;
    publisher: string;
    isbn: string;
    call_number: string;
    format: string;
    kind: string;
};

export type CatalogResults = { data: CatalogBook[]; meta: PaginationMeta };

export const searchLibraryCatalog = (field: CatalogSearchField, q: string, page = 1) =>
    api<CatalogResults>(`/teacher/library-catalog/search?${new URLSearchParams({ field, q, page: String(page) })}`);

export type CatalogLibrary = { id: string; name: string };

export const getCatalogLibraries = () =>
    api<{ data: CatalogLibrary[] }>('/admin/library-catalog/libraries').then((payload) => payload.data);
