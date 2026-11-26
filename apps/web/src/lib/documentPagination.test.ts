import { afterEach, describe, expect, it } from 'vitest';
import {
    createDocumentPaginator,
    registerPageEditor,
} from '@/lib/documentPagination';
import type { PageSpacerRequest } from '@/lib/documentPagination';

const PAGE = { width: 800, height: 100, margin: 0, gap: 0 };

const tableWithRows = (editable: boolean): HTMLElement => {
    const root = document.createElement('div');
    root.innerHTML = `
        <div data-page-unit data-page-flow-through>
            <div contenteditable="${editable}">
                <table><tbody><tr><td>A</td></tr><tr><td>B</td></tr></tbody></table>
            </div>
        </div>`;
    root.querySelectorAll('tr').forEach((row, index) => {
        row.getBoundingClientRect = () =>
            ({ top: 10 + index * 60, bottom: 70 + index * 60, left: 0, right: 100 }) as DOMRect;
    });
    root.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    document.body.append(root);

    return root;
};

describe('createDocumentPaginator', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('parte una tabla de lectura entre hojas con una fila espaciadora', () => {
        const root = tableWithRows(false);

        createDocumentPaginator(root, () => PAGE).paginate();

        expect(root.querySelectorAll('tr[data-page-spacer]')).toHaveLength(1);
    });

    it('no inserta filas dentro de una tabla que se está editando', () => {
        const root = tableWithRows(true);

        createDocumentPaginator(root, () => PAGE).paginate();

        expect(root.querySelectorAll('tr[data-page-spacer]')).toHaveLength(0);
    });

    it('pide al editor registrado que dibuje el salto antes de la fila que cruza la hoja', () => {
        const root = tableWithRows(true);
        const host = root.querySelector<HTMLElement>('[contenteditable]')!;
        const calls: PageSpacerRequest[][] = [];
        const unregister = registerPageEditor(host, {
            clear: () => calls.push([]),
            apply: (requests) => calls.push(requests),
        });

        createDocumentPaginator(root, () => PAGE).paginate();
        unregister();

        const last = calls.at(-1)!;
        expect(root.querySelectorAll('[data-page-spacer]')).toHaveLength(0);
        expect(last).toHaveLength(1);
        expect(last[0].element).toBe(root.querySelectorAll('tr')[1]);
        expect(last[0].height).toBe(30);
    });

    it('no deja filas solo de encabezado al final de una hoja', () => {
        const root = document.createElement('div');
        root.innerHTML = `
            <table><tbody>
                <tr><th>Unidad</th><th>1</th></tr>
                <tr><th>Resultados</th><th></th></tr>
                <tr><td>Semana</td><td>1</td></tr>
            </tbody></table>`;
        const bounds = [[50, 65], [65, 80], [80, 130]];
        root.querySelectorAll('tr').forEach((row, index) => {
            row.getBoundingClientRect = () =>
                ({ top: bounds[index][0], bottom: bounds[index][1], left: 0, right: 100 }) as DOMRect;
        });
        root.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
        document.body.append(root);

        createDocumentPaginator(root, () => PAGE).paginate();

        const rows = Array.from(root.querySelectorAll('tr'));
        expect(rows.filter((row) => row.hasAttribute('data-page-spacer'))).toHaveLength(1);
        expect(rows[0].hasAttribute('data-page-spacer')).toBe(true);
    });

    it('parte por filas las tablas de un bloque dentro del editor, sin pedirle el salto al editor', () => {
        const root = document.createElement('div');
        root.innerHTML = `
            <div data-page-unit>
                <div contenteditable="true">
                    <div data-block contenteditable="false">
                        <table><tbody><tr><td>A</td></tr><tr><td>B</td></tr></tbody></table>
                    </div>
                </div>
            </div>`;
        root.querySelectorAll('tr').forEach((row, index) => {
            row.getBoundingClientRect = () =>
                ({ top: 10 + index * 60, bottom: 70 + index * 60, left: 0, right: 100 }) as DOMRect;
        });
        root.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
        document.body.append(root);
        const host = root.querySelector<HTMLElement>('[contenteditable="true"]')!;
        const requests: PageSpacerRequest[][] = [];
        const unregister = registerPageEditor(host, { clear: () => undefined, apply: (next) => requests.push(next) });

        createDocumentPaginator(root, () => PAGE).paginate();
        unregister();

        expect(requests).toHaveLength(0);
        expect(root.querySelectorAll('[data-block] tr[data-page-spacer]')).toHaveLength(1);
        expect(root.querySelectorAll('tr')[1].hasAttribute('data-page-spacer')).toBe(true);
    });

    it('parte por filas la tabla de un bloque que el editor envuelve en su vista de nodo', () => {
        const root = document.createElement('div');
        root.innerHTML = `
            <div data-page-unit>
                <div contenteditable="true">
                    <div class="react-renderer node-documentBlock" contenteditable="false">
                        <div data-node-view-wrapper>
                            <div data-block>
                                <table><tbody><tr><td>A</td></tr><tr><td>B</td></tr></tbody></table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        root.querySelectorAll('tr').forEach((row, index) => {
            row.getBoundingClientRect = () =>
                ({ top: 10 + index * 60, bottom: 70 + index * 60, left: 0, right: 100 }) as DOMRect;
        });
        root.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
        document.body.append(root);
        const host = root.querySelector<HTMLElement>('[contenteditable="true"]')!;
        const requests: PageSpacerRequest[][] = [];
        const unregister = registerPageEditor(host, { clear: () => undefined, apply: (next) => requests.push(next) });

        createDocumentPaginator(root, () => PAGE).paginate();
        unregister();

        expect(requests).toHaveLength(0);
        expect(root.querySelectorAll('[data-block] tr[data-page-spacer]')).toHaveLength(1);
    });

    it('mide respecto de la hoja aunque el navegador desplace la vista al insertar un salto', () => {
        const root = document.createElement('div');
        root.innerHTML = `
            <section data-page-unit data-page-keep-next data-h="10">1.</section>
            <section data-page-unit data-h="60">Tabla</section>
            <section data-page-unit data-page-keep-next data-h="10">2.</section>
            <section data-page-unit data-h="40">2.1</section>
            <section data-page-unit data-page-keep-next data-h="10">3.</section>
            <section data-page-unit data-h="50">3.1</section>`;
        const blocks = () => Array.from(root.children) as HTMLElement[];
        const heightOf = (element: HTMLElement) =>
            element.hasAttribute('data-page-spacer')
                ? parseFloat(element.style.height)
                : Number(element.dataset.h);
        const scroll = () =>
            blocks()
                .filter((block) => block.hasAttribute('data-page-spacer'))
                .reduce((sum, block) => sum + heightOf(block), 0);
        const layoutTop = (element: HTMLElement) =>
            blocks()
                .slice(0, blocks().indexOf(element))
                .reduce((sum, block) => sum + heightOf(block), 0);
        root.getBoundingClientRect = () => ({ top: -scroll(), left: 0 }) as DOMRect;
        root.querySelectorAll<HTMLElement>('section').forEach((block) => {
            block.getBoundingClientRect = () => {
                const top = layoutTop(block) - scroll();

                return { top, bottom: top + heightOf(block), left: 0, right: 100 } as DOMRect;
            };
        });
        document.body.append(root);

        createDocumentPaginator(root, () => PAGE).paginate();

        for (const block of root.querySelectorAll<HTMLElement>('section')) {
            const top = layoutTop(block);
            const page = Math.floor(top / PAGE.height);

            expect(top + heightOf(block)).toBeLessThanOrEqual((page + 1) * PAGE.height);
        }
        const title = root.querySelectorAll<HTMLElement>('section')[4];
        expect(layoutTop(title)).toBe(2 * PAGE.height);
    });
});
