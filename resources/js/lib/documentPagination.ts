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
    table?: HTMLTableElement;
};

/** A rowspan, including rowspan=0, must stay with all the rows it covers. */
function tableUnits(table: HTMLTableElement): Unit[] {
    const rows = Array.from(table.rows);
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
            keepNext: rows[start].parentElement === table.tHead,
            table,
        });
        start = end + 1;
    }

    return units;
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

        return [
            {
                first: element,
                last: element,
                keepNext: element.hasAttribute('data-page-keep-next'),
            },
        ];
    });
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

    const reset = () => {
        for (const node of inserted) {
            node.remove();
        }

        inserted.length = 0;
    };

    const spacerBefore = (unit: Unit, height: number) => {
        const isRow = unit.first instanceof HTMLTableRowElement;
        const isListItem = unit.first.tagName === 'LI';
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

        unit.first.before(spacer);
        inserted.push(spacer);
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

            if (bottom > end + 0.5 && top > page * pitch + 0.5) {
                page++;
                spacerBefore(unit, Math.max(0, page * pitch - top));
            }

            // Exceptionally tall indivisible content remains visible, never clipped.
            const actualBottom =
                unit.last.getBoundingClientRect().bottom - origin;
            page = Math.max(page, Math.floor((actualBottom - 0.5) / pitch));
        }

        return Math.max(1, page + 1);
    };

    return { paginate, reset };
}
