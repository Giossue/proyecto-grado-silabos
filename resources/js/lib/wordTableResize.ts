import type { DocumentNode } from '@/lib/templateDocument';

type Placement = {
    row: number;
    cell: number;
    start: number;
    end: number;
    rowspan: number;
    node: DocumentNode;
};

export type CellBoundaryResizeResult =
    { table: DocumentNode; changed: boolean } | { error: string };

const cellsInGrid = (table: DocumentNode, columns: number): Placement[] => {
    const occupiedUntil = Array<number>(columns).fill(0);
    const placements: Placement[] = [];

    for (const [rowIndex, row] of (table.content ?? []).entries()) {
        let column = 0;

        for (const [cellIndex, cell] of (row.content ?? []).entries()) {
            while (occupiedUntil[column] > rowIndex) {
                column++;
            }

            const colspan = Number(cell.attrs?.colspan ?? 1);
            const rowspan = Number(cell.attrs?.rowspan ?? 1);
            const end = column + colspan;

            placements.push({
                row: rowIndex,
                cell: cellIndex,
                start: column,
                end,
                rowspan,
                node: cell,
            });

            for (let index = column; index < end; index++) {
                occupiedUntil[index] = Math.max(
                    occupiedUntil[index] ?? 0,
                    rowIndex + rowspan,
                );
            }

            column = end;
        }
    }

    return placements;
};

const closeEnough = (left: number, right: number): boolean =>
    Math.abs(left - right) < 1;

/**
 * Moves one visible cell boundary while retaining every other row boundary.
 * The resulting union grid mirrors Word: unaffected cells span any new logical column.
 */
export function resizeCellBoundary(
    source: DocumentNode,
    gridWidths: number[],
    rowIndex: number,
    cellIndex: number,
    requestedBoundary: number,
    minimumCellWidth = 20,
): CellBoundaryResizeResult {
    if (
        source.type !== 'table' ||
        gridWidths.length < 2 ||
        gridWidths.some((width) => !Number.isFinite(width) || width <= 0)
    ) {
        return { error: 'No se pudo interpretar la cuadrícula de la tabla.' };
    }

    const table = JSON.parse(JSON.stringify(source)) as DocumentNode;
    const placements = cellsInGrid(table, gridWidths.length);
    const left = placements.find(
        (placement) =>
            placement.row === rowIndex && placement.cell === cellIndex,
    );
    const right = placements.find(
        (placement) =>
            placement.row === rowIndex && placement.cell === cellIndex + 1,
    );

    if (!left || !right || left.end !== right.start) {
        return {
            error: 'Ese borde pertenece a una combinación vertical y no puede ajustarse de forma aislada.',
        };
    }

    const leftCells = new Set<Placement>([left]);
    const rightCells = new Set<Placement>([right]);
    const rowCount = table.content?.length ?? 0;
    let expanded = true;

    while (expanded) {
        expanded = false;

        for (let row = 0; row < rowCount; row++) {
            const active = [...leftCells, ...rightCells].some(
                (placement) =>
                    placement.row <= row &&
                    row < placement.row + placement.rowspan,
            );

            if (!active) {
                continue;
            }

            const touchingLeft = placements.find(
                (placement) =>
                    placement.end === left.end &&
                    placement.row <= row &&
                    row < placement.row + placement.rowspan,
            );
            const touchingRight = placements.find(
                (placement) =>
                    placement.start === left.end &&
                    placement.row <= row &&
                    row < placement.row + placement.rowspan,
            );

            if (!touchingLeft || !touchingRight) {
                return {
                    error: 'Ese borde no forma una separación continua entre celdas.',
                };
            }

            if (!leftCells.has(touchingLeft)) {
                leftCells.add(touchingLeft);
                expanded = true;
            }

            if (!rightCells.has(touchingRight)) {
                rightCells.add(touchingRight);
                expanded = true;
            }
        }
    }

    const positions = [0];

    for (const width of gridWidths) {
        positions.push(positions.at(-1)! + width);
    }

    const originalBoundary = positions[left.end];
    const minimum = Math.max(
        ...Array.from(
            leftCells,
            (placement) => positions[placement.start] + minimumCellWidth,
        ),
    );
    const maximum = Math.min(
        ...Array.from(
            rightCells,
            (placement) => positions[placement.end] - minimumCellWidth,
        ),
    );

    if (minimum >= maximum) {
        return { error: 'No hay espacio suficiente para mover ese borde.' };
    }

    const boundary = Math.min(maximum, Math.max(minimum, requestedBoundary));

    if (closeEnough(boundary, originalBoundary)) {
        return { table, changed: false };
    }

    const range = (placement: Placement): [number, number] => {
        if (leftCells.has(placement)) {
            return [positions[placement.start], boundary];
        }

        if (rightCells.has(placement)) {
            return [boundary, positions[placement.end]];
        }

        return [positions[placement.start], positions[placement.end]];
    };

    for (let row = 0; row < rowCount; row++) {
        const visible = placements
            .filter(
                (placement) =>
                    placement.row <= row &&
                    row < placement.row + placement.rowspan,
            )
            .map((placement) => range(placement))
            .sort(([leftStart], [rightStart]) => leftStart - rightStart);

        if (
            visible.length === 0 ||
            !closeEnough(visible[0][0], 0) ||
            !closeEnough(visible.at(-1)![1], positions.at(-1)!) ||
            visible.some(
                ([, end], index) =>
                    index < visible.length - 1 &&
                    !closeEnough(end, visible[index + 1][0]),
            )
        ) {
            return {
                error: 'Ese borde cruza celdas combinadas verticalmente. Sepárelas antes de moverlo.',
            };
        }
    }

    const boundaries = Array.from(
        new Set(
            placements.flatMap((placement) => {
                const [start, end] = range(placement);

                return [Math.round(start), Math.round(end)];
            }),
        ),
    ).sort((first, second) => first - second);

    if (boundaries.length - 1 > 24) {
        return {
            error: 'La tabla alcanzó el máximo de 24 divisiones internas.',
        };
    }

    const widths = boundaries
        .slice(1)
        .map((value, index) => value - boundaries[index]);

    for (const placement of placements) {
        const [start, end] = range(placement).map(Math.round);
        const first = boundaries.indexOf(start);
        const last = boundaries.indexOf(end);

        if (first < 0 || last <= first) {
            return {
                error: 'No se pudo reconstruir la cuadrícula de la tabla.',
            };
        }

        placement.node.attrs = {
            ...(placement.node.attrs ?? {}),
            colspan: last - first,
            colwidth: widths.slice(first, last),
        };
    }

    return { table, changed: true };
}
