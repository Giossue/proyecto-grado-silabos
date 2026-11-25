import { ApiError } from '@/api/client';
import type { CatalogBook } from '@/api/libraryCatalog';
import { isText, type BlockDefinition, type ListSchema } from '@silabos/shared/lib/blocks/types';
import { emptyValue } from '@silabos/shared/lib/blocks/values';

const listOf = (definition: BlockDefinition): { name: string; schema: ListSchema } | null => {
    const name = definition.catalog?.list;
    const schema = name ? definition.value[name] : undefined;

    return name && schema?.type === 'array' && schema.items.type === 'object' ? { name, schema } : null;
};

const MISSING = 'N/A';

const blank = (row: unknown): boolean => typeof row === 'object' && row !== null && Object.values(row).every((cell) => String(cell ?? '').trim() === '');

/** ¿Se puede agregar otro libro? Una fila vacía se aprovecha, así que solo cuenta la lista llena. */
export const canAddCatalogBook = (definition: BlockDefinition, value: Record<string, unknown>): boolean => {
    const list = listOf(definition);
    const rows = list && Array.isArray(value[list.name]) ? (value[list.name] as unknown[]) : [];

    return list !== null && (rows.length < list.schema.maxItems || blank(rows[rows.length - 1]));
};

/** Pone el libro en la lista del bloque, en las columnas que la plantilla indica; null si no cabe. */
export const addCatalogBook = (definition: BlockDefinition, value: Record<string, unknown>, book: CatalogBook, props: Record<string, unknown>): Record<string, unknown> | null => {
    const list = listOf(definition);
    if (!list || !canAddCatalogBook(definition, value)) return null;
    const columns = (list.schema.items.type === 'object' ? list.schema.items.properties : {});
    const row = emptyValue(list.schema.items, props) as Record<string, unknown>;
    for (const [field, column] of Object.entries(definition.catalog?.map ?? {})) {
        const schema = columns[column];
        const text = ((book as Record<string, string>)[field] ?? '').trim() || MISSING;
        if (isText(schema)) row[column] = text.slice(0, schema.maxLength);
    }
    const rows = Array.isArray(value[list.name]) ? [...(value[list.name] as unknown[])] : [];
    if (blank(rows[rows.length - 1])) rows.pop();

    return { ...value, [list.name]: [...rows, row] };
};

/** Texto para el docente cuando falla la búsqueda: el aviso del servidor o uno genérico. */
export const catalogErrorMessage = (reason: unknown): string => reason instanceof ApiError
    ? (Object.values(reason.errors).flat()[0] ?? reason.message)
    : 'No se pudo buscar en la biblioteca';
