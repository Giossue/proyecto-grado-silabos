import { describe, expect, it } from 'vitest';
import type { CatalogBook } from '@/api/libraryCatalog';
import { ApiError } from '@/api/client';
import { addCatalogBook, canAddCatalogBook, catalogErrorMessage } from '@/lib/blocks/catalog';
import type { BlockDefinition } from '@silabos/shared/lib/blocks/types';
import definition from '@silabos/shared/test/fixtures/template-definition.json';

const block = (definition as unknown as { blocks: Record<string, BlockDefinition> }).blocks.bibliografia!;
const book: CatalogBook = { id: '10525', title: 'Proyectos de inversión', author: 'Sapag Chain, Nassir', year: '2011', place: 'Santiago de Chile', publisher: 'Pearson Educación', isbn: '9789563431063', call_number: '658.404 S2411p', format: 'Libro físico', kind: 'Libro' };
const empty = { autor: '', titulo: '', anio: '', ciudad: '', editorial: '', isbn: '', codigo: '' };
const full = { autor: 'Sapag Chain, Nassir', titulo: 'Proyectos de inversión', anio: '2011', ciudad: 'Santiago de Chile', editorial: 'Pearson Educación', isbn: '9789563431063', codigo: 'Libro físico' };

describe('libros del catálogo en un bloque', () => {
    it('la plantilla oficial declara a qué columna va cada dato, con el tipo de libro en «Código»', () => {
        expect(block.catalog).toEqual({ list: 'libros', map: { author: 'autor', title: 'titulo', year: 'anio', place: 'ciudad', publisher: 'editorial', isbn: 'isbn', format: 'codigo' } });
    });

    it('pone N/A en los datos que el catálogo no tiene', () => {
        const [row] = (addCatalogBook(block, { libros: [empty] }, { ...book, place: '', publisher: ' ', isbn: '' }, {})!.libros as Array<Record<string, string>>);

        expect(row).toMatchObject({ ciudad: 'N/A', editorial: 'N/A', isbn: 'N/A', codigo: 'Libro físico' });
    });

    it('aprovecha la fila vacía del principio', () => {
        expect(addCatalogBook(block, { libros: [empty] }, book, {})).toEqual({ libros: [full] });
    });

    it('agrega al final cuando la última fila ya tiene algo', () => {
        const other = { ...empty, titulo: 'Otro libro' };

        expect(addCatalogBook(block, { libros: [other] }, book, {})).toEqual({ libros: [other, full] });
    });

    it('no llena columnas que la plantilla no tiene y respeta el largo de cada columna', () => {
        const narrow = structuredClone(block);
        delete (narrow.value.libros as { items: { properties: Record<string, unknown> } }).items.properties.ciudad;
        (narrow.value.libros as { items: { properties: Record<string, { maxLength: number }> } }).items.properties.titulo!.maxLength = 8;

        const [row] = (addCatalogBook(narrow, { libros: [empty] }, book, {})!.libros as Array<Record<string, string>>);

        expect(row).not.toHaveProperty('ciudad', 'Santiago de Chile');
        expect(row!.titulo).toBe('Proyecto');
    });

    it('no agrega cuando la lista está llena', () => {
        const rows = Array.from({ length: 40 }, (_, index) => ({ ...empty, titulo: `Libro ${index}` }));

        expect(canAddCatalogBook(block, { libros: rows })).toBe(false);
        expect(addCatalogBook(block, { libros: rows }, book, {})).toBeNull();
    });

    it('un bloque sin catálogo no acepta libros', () => {
        expect(addCatalogBook({ ...block, catalog: undefined }, { libros: [empty] }, book, {})).toBeNull();
    });

    it('el aviso de la búsqueda es el del servidor o uno genérico', () => {
        expect(catalogErrorMessage(new ApiError('El catálogo de la biblioteca no está disponible', 503))).toBe('El catálogo de la biblioteca no está disponible');
        expect(catalogErrorMessage(new ApiError('Datos inválidos', 422, { q: ['El texto a buscar es demasiado corto'] }))).toBe('El texto a buscar es demasiado corto');
        expect(catalogErrorMessage(new Error('red'))).toBe('No se pudo buscar en la biblioteca');
    });
});
