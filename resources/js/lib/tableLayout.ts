/**
 * Esquema de una tabla de la plantilla (I-34), espejo de `TableLayout` en PHP.
 * Columnas planas con agrupaciones de cabecera en dos niveles: `group` dentro de
 * `band`. Las celdas combinadas solo existen en la cabecera y en los totales.
 */
export type TableColumnType = 'text' | 'number';
export type TableColumnRole = 'week' | 'hours_acd' | 'hours_ape' | 'hours_aa';

export type TableColumn = {
    key: string;
    label: string;
    type: TableColumnType;
    group: string | null;
    band: string | null;
    /** Solo numéricas: si entra en la fila de totales (las semanas no). */
    sum?: boolean;
    /** Peso relativo del ancho, calcado del formato oficial; vacío = automático. */
    width?: number | null;
    /** Significado estable para validaciones; no depende de la etiqueta visible. */
    role?: TableColumnRole | null;
};

export type TableNamed = { key: string; label: string };

export type TableLayout = {
    columns: TableColumn[];
    groups: TableNamed[];
    bands: TableNamed[];
    header_fields: TableNamed[];
    totals: { enabled: boolean; label: string };
    repeat: { enabled: boolean; label: string };
};

export type TableCellValue = string | number | boolean | null;

/** Una fila guardada: un valor por columna más las marcas `_unit` y `_kind`. */
export type TableRowData = Record<string, TableCellValue | undefined>;

export type PlanningExpectations = {
    teaching_weeks: number | null;
    credits: number | string | null;
    total_hours: number | string | null;
    hours_acd: number | string | null;
    hours_ape: number | string | null;
    hours_aa: number | string | null;
};

export type PlanningSummary = {
    weeks: number[];
    totals: Record<'hours_acd' | 'hours_ape' | 'hours_aa', number>;
};

export type HeaderCell = {
    id: string;
    kind: 'band' | 'group' | 'leaf';
    key: string;
    label: string;
    colspan: number;
    rowspan: number;
    /** Índices de columnas que cubre la celda. */
    columns: number[];
};

export const defaultTableLayout = (): TableLayout => ({
    columns: [
        {
            key: 'texto',
            label: 'Contenido',
            type: 'text',
            group: null,
            band: null,
            role: null,
        },
    ],
    groups: [],
    bands: [],
    header_fields: [],
    totals: { enabled: false, label: 'Total' },
    repeat: { enabled: false, label: 'Unidad' },
});

export const cloneTableLayout = (layout: TableLayout): TableLayout => ({
    columns: layout.columns.map((column) => ({ ...column })),
    groups: layout.groups.map((group) => ({ ...group })),
    bands: layout.bands.map((band) => ({ ...band })),
    header_fields: layout.header_fields.map((field) => ({ ...field })),
    totals: { ...layout.totals },
    repeat: { ...layout.repeat },
});

/** Clave técnica a partir de un nombre; única dentro de la lista dada. */
export const tableKeyFor = (label: string, taken: string[]): string => {
    const normalized = label
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40);
    const base =
        normalized === '' || !/^[a-z]/.test(normalized)
            ? `col_${normalized || 'nueva'}`
            : normalized;
    let candidate = base;
    let suffix = 2;

    while (taken.includes(candidate)) {
        candidate = `${base}_${suffix++}`;
    }

    return candidate;
};

/**
 * Cabecera como matriz de filas: hasta tres (agrupamiento, grupo, columna). Cada
 * columna sabe en qué fila empieza y cuántas ocupa; las vecinas del mismo grupo
 * se funden en una sola celda.
 */
export const headerRows = (layout: TableLayout): HeaderCell[][] => {
    const columns = layout.columns;
    const hasBand = columns.some((column) => column.band !== null);
    const hasGroup = columns.some((column) => column.group !== null);
    const depth = 1 + (hasBand ? 1 : 0) + (hasGroup ? 1 : 0);
    const groupLabel = new Map(layout.groups.map((g) => [g.key, g.label]));
    const bandLabel = new Map(layout.bands.map((b) => [b.key, b.label]));

    type Slot = {
        id: string;
        kind: HeaderCell['kind'];
        key: string;
        label: string;
        rowspan: number;
    } | null;
    const matrix: Slot[][] = Array.from({ length: depth }, () =>
        Array.from({ length: columns.length }, () => null),
    );

    columns.forEach((column, index) => {
        let row = 0;

        if (hasBand && column.band !== null) {
            matrix[0][index] = {
                id: `band:${column.band}`,
                kind: 'band',
                key: column.band,
                label: bandLabel.get(column.band) ?? '',
                rowspan: 1,
            };
            row = 1;
        }

        if (hasGroup && column.group !== null) {
            const rowspan = hasBand && column.band === null ? 2 : 1;
            matrix[row][index] = {
                id: `group:${column.group}`,
                kind: 'group',
                key: column.group,
                label: groupLabel.get(column.group) ?? '',
                rowspan,
            };
            row += rowspan;
        }

        matrix[row][index] = {
            id: `leaf:${column.key}`,
            kind: 'leaf',
            key: column.key,
            label: column.label,
            rowspan: depth - row,
        };
    });

    const rows: HeaderCell[][] = [];

    for (let rowIndex = 0; rowIndex < depth; rowIndex++) {
        const cells: HeaderCell[] = [];
        let columnIndex = 0;

        while (columnIndex < columns.length) {
            const slot = matrix[rowIndex][columnIndex];

            if (slot === null) {
                columnIndex++;
                continue;
            }

            let colspan = 1;

            while (
                slot.kind !== 'leaf' &&
                columnIndex + colspan < columns.length &&
                matrix[rowIndex][columnIndex + colspan]?.id === slot.id
            ) {
                colspan++;
            }

            const covered = Array.from(
                { length: colspan },
                (_, offset) => columnIndex + offset,
            );

            for (let extra = 1; extra < slot.rowspan; extra++) {
                for (const covering of covered) {
                    matrix[rowIndex + extra][covering] = null;
                }
            }

            cells.push({
                id: slot.id,
                kind: slot.kind,
                key: slot.key,
                label: slot.label,
                colspan,
                rowspan: slot.rowspan,
                columns: covered,
            });
            columnIndex += colspan;
        }

        rows.push(cells);
    }

    return rows;
};

export const numericColumns = (layout: TableLayout): TableColumn[] =>
    layout.columns.filter((column) => column.type === 'number');

/**
 * Anchos en porcentaje cuando todas las columnas declaran su peso (formato oficial);
 * si falta alguno, se deja que el navegador reparta.
 */
export const columnWidths = (layout: TableLayout): string[] | null => {
    const weights: number[] = [];

    for (const column of layout.columns) {
        if (!column.width || column.width <= 0) {
            return null;
        }

        weights.push(column.width);
    }

    const total = weights.reduce((sum, weight) => sum + weight, 0);

    return weights.map((weight) => `${((weight * 100) / total).toFixed(2)}%`);
};

/** Columnas que suman en la fila de totales. */
export const totalizes = (column: TableColumn): boolean =>
    column.type === 'number' && column.sum !== false;

export const sumColumn = (rows: TableRowData[], key: string): number =>
    rows.reduce((total, row) => {
        const value = row[key];
        const number =
            typeof value === 'number'
                ? value
                : typeof value === 'string' && value.trim() !== ''
                  ? Number(value)
                  : Number.NaN;

        return Number.isFinite(number) ? total + number : total;
    }, 0);

/** Suma sin decimales de relleno: 12, 2.5. */
export const formatSum = (value: number): string =>
    Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

export const planningColumns = (
    layout: TableLayout,
): Partial<Record<TableColumnRole, string>> =>
    Object.fromEntries(
        layout.columns
            .filter((column) => column.role)
            .map((column) => [column.role, column.key]),
    );

export const isPlanningTable = (layout: TableLayout): boolean => {
    const columns = planningColumns(layout);

    return ['week', 'hours_acd', 'hours_ape', 'hours_aa'].every(
        (role) => columns[role as TableColumnRole],
    );
};

export const summarizePlanning = (
    layout: TableLayout,
    rows: TableRowData[],
): PlanningSummary | null => {
    if (!isPlanningTable(layout)) {
        return null;
    }

    const columns = planningColumns(layout) as Record<TableColumnRole, string>;
    const dataRows = rows.filter((row) => row._kind !== 'unit');
    const numeric = (value: TableRowData[string]): number => {
        const result = typeof value === 'number' ? value : Number(value);

        return Number.isFinite(result) ? result : 0;
    };

    return {
        weeks: dataRows
            .map((row) => numeric(row[columns.week]))
            .filter((week) => Number.isInteger(week) && week > 0)
            .sort((a, b) => a - b),
        totals: {
            hours_acd: Number(
                dataRows
                    .reduce(
                        (sum, row) => sum + numeric(row[columns.hours_acd]),
                        0,
                    )
                    .toFixed(2),
            ),
            hours_ape: Number(
                dataRows
                    .reduce(
                        (sum, row) => sum + numeric(row[columns.hours_ape]),
                        0,
                    )
                    .toFixed(2),
            ),
            hours_aa: Number(
                dataRows
                    .reduce(
                        (sum, row) => sum + numeric(row[columns.hours_aa]),
                        0,
                    )
                    .toFixed(2),
            ),
        },
    };
};

export type TableUnit<Row> = {
    number: number;
    header: Row | null;
    rows: Row[];
};

/**
 * Agrupa filas por unidad. La fila con `_kind = unit` es la cabecera de la unidad.
 * Sin repetición, todo cae en la unidad 1.
 */
export const groupByUnit = <Row extends { data: TableRowData }>(
    rows: Row[],
    repeat: boolean,
): TableUnit<Row>[] => {
    const units = new Map<number, TableUnit<Row>>();

    for (const row of rows) {
        const raw = repeat ? Number(row.data._unit ?? 1) : 1;
        const number = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
        const unit = units.get(number) ?? { number, header: null, rows: [] };

        if (row.data._kind === 'unit') {
            unit.header = row;
        } else {
            unit.rows.push(row);
        }

        units.set(number, unit);
    }

    return [...units.values()].sort((a, b) => a.number - b.number);
};
