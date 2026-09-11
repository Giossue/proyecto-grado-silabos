/** Presentation only: these breaks never enter a template or a syllabus snapshot. */
export const LETTER_PAGE = {
    width: (21.59 * 96) / 2.54,
    height: (27.94 * 96) / 2.54,
    margin: (2.5 * 96) / 2.54,
    gap: 24,
};

export type DocumentPageMetrics = typeof LETTER_PAGE;

type Unit = {
    first: HTMLElement;
    last: HTMLElement;
    keepNext: boolean;
    flowThrough: boolean;
    table?: HTMLTableElement;
    repeatHeader?: HTMLTableRowElement[];
};

/** A rowspan, including rowspan=0, must stay with all the rows it covers. */
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

    for (let start = 0; start < rows.length;) {
        let end = start;

        for (let index = start; index <= end; index++) {
            for (const cell of rows[index].cells) {
                const group = rows[index].parentElement;
                const groupEnd = rows.findLastIndex(
                    (row) => row.parentElement === group,
                );
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
                repeatHeader.includes(rows[start]),
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

function collectUnits(root: HTMLElement): Unit[] {
    return Array.from(
        root.querySelectorAll<HTMLElement>('[data-page-unit], table'),
    ).flatMap((element) => {
        if (element.parentElement?.closest('table, [data-page-unit]')) {
            return [];
        }

        if (element instanceof HTMLTableElement) {
            return tableUnits(element);
        }

        if (element.hasAttribute('data-page-flow-through')) {
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

/**
 * Keep a page spacer outside presentation wrappers when the unit is their first visible
 * child. Otherwise an outline on a selected section or field would also surround the
 * artificial empty space used to reach the following sheet.
 */
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

/**
 * Inserts only disposable layout spacers. Original Vue nodes, event listeners,
 * inputs and their selection stay in place. Cleanup before each measurement
 * means pages also disappear when content shrinks.
 */
export function createDocumentPaginator(
    root: HTMLElement,
    metrics: () => DocumentPageMetrics = () => LETTER_PAGE,
) {
    const inserted: HTMLElement[] = [];
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
    };

    const spacerBefore = (unit: Unit, height: number) => {
        const isRow = unit.first instanceof HTMLTableRowElement;
        const isListItem = unit.first.tagName === 'LI';
        const anchor = spacerAnchor(unit.first, root);
        const spacer = document.createElement(
            isRow ? 'tr' : isListItem ? 'li' : 'div',
        );
        spacer.setAttribute('data-page-spacer', '');
        spacer.setAttribute('aria-hidden', 'true');
        spacer.style.cssText = `height:${height}px;pointer-events:none;margin:0;padding:0;list-style:none;counter-increment:list-item 0;`;

        if (isRow) {
            const cell = document.createElement('td');
            cell.colSpan = Math.max(
                ...Array.from(unit.table!.rows, (row) =>
                    Array.from(row.cells).reduce(
                        (sum, item) => sum + item.colSpan,
                        0,
                    ),
                ),
            );
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
        const origin = root.getBoundingClientRect().top;
        const units = collectUnits(root);
        let page = 0;

        for (let index = 0; index < units.length; index++) {
            const unit = units[index];
            let last = index;

            while (units[last].keepNext && last + 1 < units.length) {
                last++;
            }

            const top = unit.first.getBoundingClientRect().top - origin;
            let bottom =
                units[last].last.getBoundingClientRect().bottom - origin;
            const end = page * pitch + usable;

            // A heading should accompany the first content, not an entire section.
            if (bottom - top > usable) {
                bottom = unit.last.getBoundingClientRect().bottom - origin;
            }

            if (
                !unit.flowThrough &&
                bottom > end + 0.5 &&
                top > page * pitch + 0.5
            ) {
                page++;
                spacerBefore(unit, Math.max(0, page * pitch - top));
            }

            // Exceptionally tall indivisible content remains visible, never clipped.
            const actualBottom =
                unit.last.getBoundingClientRect().bottom - origin;
            page = Math.max(page, Math.floor((actualBottom - 0.5) / pitch));
        }

        rememberGeometry();

        return Math.max(1, page + 1);
    };

    return { paginate, reset, hasGeometryChanged };
}
