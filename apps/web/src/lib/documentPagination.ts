export const LETTER_PAGE = {
    width: (21.59 * 96) / 2.54,
    height: (27.94 * 96) / 2.54,
    margin: (1.5 * 96) / 2.54,
    gap: 24,
};

export const A4_PAGE = {
    width: (21 * 96) / 2.54,
    height: (29.7 * 96) / 2.54,
    margin: (1.5 * 96) / 2.54,
    gap: 24,
};

export type DocumentPageMetrics = typeof LETTER_PAGE;

export type PageSpacerRequest = {
    element: HTMLElement;
    height: number;
    colspan: number;
};

type PageEditor = {
    clear: () => void;
    apply: (requests: PageSpacerRequest[]) => void;
};

const pageEditors = new Map<HTMLElement, PageEditor>();

export function registerPageEditor(element: HTMLElement, editor: PageEditor) {
    pageEditors.set(element, editor);

    return () => {
        pageEditors.delete(element);
    };
}

function editorOf(element: HTMLElement): HTMLElement | undefined {
    for (const host of pageEditors.keys()) {
        if (host !== element && host.contains(element)) {
            return host;
        }
    }

    return undefined;
}

function editorUnits(host: HTMLElement): Unit[] {
    return Array.from(host.children).flatMap((child) => {
        if (!(child instanceof HTMLElement) || child.hasAttribute('data-page-spacer')) {
            return [];
        }

        const table =
            child instanceof HTMLTableElement
                ? child
                : child.querySelector(':scope > table');

        if (table instanceof HTMLTableElement) {
            return tableUnits(table);
        }

        if (child.hasAttribute('data-block')) {
            const tables = Array.from(child.querySelectorAll('table')).filter(
                (candidate) => !candidate.parentElement?.closest('table'),
            );

            if (tables.length > 0) {
                return tables.flatMap(tableUnits);
            }
        }

        if (['UL', 'OL'].includes(child.tagName)) {
            const items = Array.from(child.children).filter(
                (item): item is HTMLLIElement =>
                    item instanceof HTMLLIElement &&
                    !item.hasAttribute('data-page-spacer'),
            );

            if (items.length > 0) {
                return items.map((item) => ({
                    first: item,
                    last: item,
                    keepNext: false,
                    flowThrough: false,
                }));
            }
        }

        return [
            {
                first: child,
                last: child,
                keepNext: /^H[1-6]$/.test(child.tagName),
                flowThrough: false,
            },
        ];
    });
}

type Unit = {
    first: HTMLElement;
    last: HTMLElement;
    keepNext: boolean;
    flowThrough: boolean;
    table?: HTMLTableElement;
    repeatHeader?: HTMLTableRowElement[];
};

function tableUnits(table: HTMLTableElement): Unit[] {
    const rows = Array.from(table.rows).filter(
        (row) =>
            !row.hasAttribute('data-page-spacer') &&
            !row.hasAttribute('data-page-repeat-header-row'),
    );
    const firstBodyRow = rows.findIndex((row) =>
        Array.from(row.cells).some((cell) => cell.tagName !== 'TH'),
    );
    const repeatHeader = table.hasAttribute('data-page-repeat-header')
        ? rows.slice(0, firstBodyRow === -1 ? rows.length : firstBodyRow)
        : [];
    const units: Unit[] = [];
    const headingOnly = (from: number, to: number) =>
        rows
            .slice(from, to + 1)
            .every((row) =>
                Array.from(row.cells).every((cell) => cell.tagName === 'TH'),
            );

    for (let start = 0; start < rows.length;) {
        let end = start;

        for (let index = start; index <= end; index++) {
            for (const cell of rows[index].cells) {
                const group = rows[index].parentElement;
                let groupEnd = index;
                for (let candidate = rows.length - 1; candidate >= index; candidate--) {
                    if (rows[candidate].parentElement === group) {
                        groupEnd = candidate;
                        break;
                    }
                }
                end = Math.max(
                    end,
                    cell.rowSpan === 0
                        ? groupEnd
                        : Math.min(index + cell.rowSpan - 1, groupEnd),
                );
            }
        }

        units.push({
            first: rows[start],
            last: rows[end],
            keepNext:
                rows[start].parentElement === table.tHead ||
                repeatHeader.includes(rows[start]) ||
                headingOnly(start, end),
            flowThrough: false,
            table,
            repeatHeader:
                start >= repeatHeader.length && repeatHeader.length > 0
                    ? repeatHeader
                    : undefined,
        });
        start = end + 1;
    }

    return units;
}

function fragmentUnits(element: HTMLElement): Unit[] {
    const fragments = Array.from(
        element.querySelectorAll<HTMLElement>('[data-page-fragment]'),
    ).filter((fragment) => fragment.getClientRects().length > 0);
    const lines: (Unit & { top: number })[] = [];

    for (const fragment of fragments) {
        const top = fragment.getBoundingClientRect().top;
        const line = lines.at(-1);

        if (!line || Math.abs(line.top - top) > 0.5) {
            lines.push({
                first: fragment,
                last: fragment,
                keepNext: false,
                flowThrough: false,
                top,
            });
        } else {
            line.last = fragment;
        }
    }

    return lines;
}

function markdownFlowThroughUnits(element: HTMLElement): Unit[] {
    return Array.from(element.children).flatMap((child) => {
        if (!(child instanceof HTMLElement) || child.hasAttribute('data-page-spacer')) {
            return [];
        }

        if (child instanceof HTMLTableElement) {
            return tableUnits(child);
        }

        if (['UL', 'OL'].includes(child.tagName)) {
            const items = Array.from(child.children).filter(
                (item): item is HTMLLIElement =>
                    item instanceof HTMLLIElement &&
                    !item.hasAttribute('data-page-spacer'),
            );

            if (items.length > 0) {
                return items.map((item) => ({
                    first: item,
                    last: item,
                    keepNext: false,
                    flowThrough: false,
                }));
            }
        }

        return [
            {
                first: child,
                last: child,
                keepNext: /^H[1-6]$/.test(child.tagName),
                flowThrough: false,
            },
        ];
    });
}

function collectUnits(root: HTMLElement): Unit[] {
    return Array.from(
        root.querySelectorAll<HTMLElement>(
            '[data-page-unit], [data-page-markdown-flow-through], table',
        ),
    ).flatMap((element) => {
        if (
            element.parentElement?.closest('[data-page-markdown-flow-through]')
        ) {
            return [];
        }

        if (element.parentElement?.closest('table, [data-page-unit]')) {
            return [];
        }

        if (element instanceof HTMLTableElement) {
            return tableUnits(element);
        }

        const editor = Array.from(pageEditors.keys()).find((host) =>
            element.contains(host),
        );

        if (editor) {
            const units = editorUnits(editor);

            if (units.length > 0) {
                return units;
            }
        }

        if (element.hasAttribute('data-page-markdown-flow-through')) {
            return markdownFlowThroughUnits(element);
        }

        if (
            element.hasAttribute('data-page-flow-through') &&
            !element.querySelector('[contenteditable="true"]')
        ) {
            const tables = Array.from(element.querySelectorAll('table'))
                .filter((table) => !table.parentElement?.closest('table'))
                .flatMap(tableUnits);

            if (tables.length > 0) {
                return tables;
            }

            const fragments = fragmentUnits(element);

            if (fragments.length > 0) {
                return fragments;
            }
        }

        return [
            {
                first: element,
                last: element,
                keepNext: element.hasAttribute('data-page-keep-next'),
                flowThrough: element.hasAttribute('data-page-flow-through'),
            },
        ];
    });
}

function spacerAnchor(first: HTMLElement, root: HTMLElement): HTMLElement {
    if (first instanceof HTMLTableRowElement || first.tagName === 'LI') {
        return first;
    }

    let anchor = first;

    while (anchor.parentElement && anchor.parentElement !== root) {
        const parent = anchor.parentElement;

        if (
            parent instanceof HTMLTableElement ||
            ['THEAD', 'TBODY', 'TFOOT', 'TR', 'UL', 'OL'].includes(
                parent.tagName,
            )
        ) {
            break;
        }

        const children = Array.from(parent.children);
        const siblingsBefore = children.slice(0, children.indexOf(anchor));
        const hasVisibleContentBefore = siblingsBefore.some(
            (sibling) =>
                !sibling.hasAttribute('data-page-spacer') &&
                sibling.getClientRects().length > 0,
        );

        if (hasVisibleContentBefore) {
            break;
        }

        anchor = parent;
    }

    return anchor;
}

export function createDocumentPaginator(
    root: HTMLElement,
    metrics: () => DocumentPageMetrics = () => LETTER_PAGE,
) {
    const inserted: HTMLElement[] = [];
    const editorRequests = new Map<HTMLElement, PageSpacerRequest[]>();
    let snapshot: {
        first: HTMLElement;
        last: HTMLElement;
        top: number;
        right: number;
        bottom: number;
        left: number;
    }[] = [];

    const geometry = () => {
        const origin = root.getBoundingClientRect();

        return collectUnits(root).map((unit) => {
            const first = unit.first.getBoundingClientRect();
            const last = unit.last.getBoundingClientRect();

            return {
                first: unit.first,
                last: unit.last,
                top: first.top - origin.top,
                right: last.right - origin.left,
                bottom: last.bottom - origin.top,
                left: first.left - origin.left,
            };
        });
    };

    const rememberGeometry = () => {
        snapshot = geometry();
    };

    const hasGeometryChanged = () => {
        const current = geometry();

        if (current.length !== snapshot.length) {
            return true;
        }

        return current.some((unit, index) => {
            const previous = snapshot[index];

            return (
                unit.first !== previous.first ||
                unit.last !== previous.last ||
                Math.abs(unit.top - previous.top) > 0.5 ||
                Math.abs(unit.right - previous.right) > 0.5 ||
                Math.abs(unit.bottom - previous.bottom) > 0.5 ||
                Math.abs(unit.left - previous.left) > 0.5
            );
        });
    };

    const reset = () => {
        for (const node of inserted) {
            node.remove();
        }

        inserted.length = 0;
        snapshot = [];

        for (const [host, editor] of pageEditors) {
            if (root.contains(host)) {
                editor.clear();
            }
        }

        editorRequests.clear();
    };

    const spacerBefore = (unit: Unit, height: number) => {
        const isRow = unit.first instanceof HTMLTableRowElement;
        const columns = () =>
            Math.max(
                ...Array.from(unit.table!.rows, (row) =>
                    Array.from(row.cells).reduce(
                        (sum, item) => sum + item.colSpan,
                        0,
                    ),
                ),
            );
        const editor = editorOf(unit.first);

        if (editor && !unit.first.closest('[data-block]')) {
            const requests = editorRequests.get(editor) ?? [];

            requests.push({
                element: unit.first,
                height,
                colspan: isRow ? columns() : 1,
            });
            editorRequests.set(editor, requests);
            pageEditors.get(editor)?.apply([...requests]);

            return;
        }

        const isListItem = unit.first.tagName === 'LI';
        const anchor = spacerAnchor(unit.first, root);
        const spacer = document.createElement(
            isRow ? 'tr' : isListItem ? 'li' : 'div',
        );
        spacer.setAttribute('data-page-spacer', '');
        spacer.setAttribute('aria-hidden', 'true');
        spacer.setAttribute('contenteditable', 'false');
        spacer.style.cssText = `height:${height}px;pointer-events:none;overflow-anchor:none;margin:0;padding:0;list-style:none;counter-increment:list-item 0;`;

        if (isRow) {
            const cell = document.createElement('td');
            cell.colSpan = columns();
            cell.style.cssText = `height:${height}px;padding:0!important;border:0!important;background:transparent!important;`;
            spacer.append(cell);
        }

        anchor.before(spacer);
        inserted.push(spacer);

        if (isRow && unit.repeatHeader?.length) {
            let previous = spacer;

            for (const source of unit.repeatHeader) {
                const repeated = source.cloneNode(true) as HTMLTableRowElement;

                repeated.setAttribute('data-page-repeat-header-row', '');
                repeated.setAttribute('aria-hidden', 'true');
                repeated.setAttribute('inert', '');
                repeated
                    .querySelectorAll('[id]')
                    .forEach((node) => node.removeAttribute('id'));
                previous.after(repeated);
                previous = repeated;
                inserted.push(repeated);
            }
        }
    };

    const paginate = () => {
        reset();
        const { height, margin, gap } = metrics();
        const pitch = height + gap;
        const usable = height - 2 * margin;
        const topOf = (element: HTMLElement) =>
            element.getBoundingClientRect().top -
            root.getBoundingClientRect().top;
        const bottomOf = (element: HTMLElement) =>
            element.getBoundingClientRect().bottom -
            root.getBoundingClientRect().top;
        const units = collectUnits(root);
        let page = 0;

        for (let index = 0; index < units.length; index++) {
            const unit = units[index];
            let last = index;

            while (units[last].keepNext && last + 1 < units.length) {
                last++;
            }

            const top = topOf(unit.first);
            let bottom = bottomOf(units[last].last);
            const end = page * pitch + usable;

            if (bottom - top > usable) {
                bottom = bottomOf(unit.last);
            }

            if (
                !unit.flowThrough &&
                bottom > end + 0.5 &&
                top > page * pitch + 0.5
            ) {
                page++;
                spacerBefore(unit, Math.max(0, page * pitch - top));
            }

            const actualBottom = bottomOf(unit.last);
            page = Math.max(page, Math.floor((actualBottom - 0.5) / pitch));
        }

        rememberGeometry();

        return Math.max(1, page + 1);
    };

    return { paginate, reset, hasGeometryChanged };
}
