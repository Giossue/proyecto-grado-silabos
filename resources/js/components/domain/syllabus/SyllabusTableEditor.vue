<script setup lang="ts">
import { Trash2 } from '@lucide/vue';
import { computed } from 'vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
    formatSum,
    groupByUnit,
    headerRows,
    sumColumn,
} from '@/lib/tableLayout';
import type { TableLayout, TableRowData } from '@/lib/tableLayout';

type EditableRow = { id: string | null; data: TableRowData };

/**
 * Cuadrícula que llena el docente: una casilla por celda, filas por unidad,
 * totales calculados. Nunca muta las filas recibidas: emite la lista nueva y el
 * editor del sílabo la guarda.
 */
const props = defineProps<{
    fieldId: string;
    label: string;
    layout: TableLayout;
    rows: EditableRow[];
    required: boolean;
    invalid: boolean;
}>();

const emit = defineEmits<{
    'update:rows': [rows: EditableRow[]];
}>();

const header = computed(() => headerRows(props.layout));
const units = computed(() => {
    const grouped = groupByUnit(props.rows, props.layout.repeat.enabled);

    return grouped.length > 0
        ? grouped
        : [{ number: 1, header: null, rows: [] }];
});

const cellId = (unit: number, row: number, key: string): string =>
    `field-${props.fieldId}-u${unit}-r${row}-${key}`;

const display = (value: TableRowData[string]): string | number =>
    value === null || value === undefined || typeof value === 'boolean'
        ? ''
        : value;

const cloneRows = (): EditableRow[] =>
    props.rows.map((row) => ({ id: row.id, data: { ...row.data } }));

const unitMark = (unit: number): TableRowData =>
    props.layout.repeat.enabled ? { _unit: unit } : {};

const setCell = (
    target: EditableRow,
    key: string,
    value: string | number,
    type: 'text' | 'number',
): void => {
    const rows = cloneRows();
    const row = rows[props.rows.indexOf(target)];

    if (!row) {
        return;
    }

    if (type === 'number') {
        const text = String(value).trim();
        row.data[key] = text === '' ? '' : Number(text);
    } else {
        row.data[key] = String(value);
    }

    emit('update:rows', rows);
};

const setHeader = (
    unit: number,
    existing: EditableRow | null,
    key: string,
    value: string | number,
): void => {
    const rows = cloneRows();

    if (existing) {
        const row = rows[props.rows.indexOf(existing)];
        row.data[key] = String(value);
    } else {
        rows.unshift({
            id: null,
            data: { ...unitMark(unit), _kind: 'unit', [key]: String(value) },
        });
    }

    emit('update:rows', rows);
};

const addRow = (unit: number): void => {
    const data: TableRowData = { ...unitMark(unit) };

    for (const column of props.layout.columns) {
        data[column.key] = '';
    }

    emit('update:rows', [...cloneRows(), { id: null, data }]);
};

const removeRow = (target: EditableRow): void => {
    const index = props.rows.indexOf(target);
    const rows = cloneRows();
    rows.splice(index, 1);
    emit('update:rows', rows);
};

const addUnit = (): void => {
    const next = Math.max(0, ...units.value.map((unit) => unit.number)) + 1;
    const header: EditableRow = {
        id: null,
        data: { _unit: next, _kind: 'unit' },
    };

    for (const field of props.layout.header_fields) {
        header.data[field.key] = '';
    }

    emit('update:rows', [...cloneRows(), header]);
};

/** Quita la unidad y renumera las siguientes para no dejar huecos. */
const removeUnit = (number: number): void => {
    const rows = cloneRows()
        .filter((row) => Number(row.data._unit ?? 1) !== number)
        .map((row) => {
            const current = Number(row.data._unit ?? 1);

            return current > number
                ? { ...row, data: { ...row.data, _unit: current - 1 } }
                : row;
        });

    emit('update:rows', rows);
};
</script>

<template>
    <div class="flex flex-col gap-4">
        <div
            v-for="unit in units"
            :key="unit.number"
            class="flex flex-col gap-3 rounded-lg border p-3"
        >
            <div
                v-if="layout.repeat.enabled || layout.header_fields.length > 0"
                class="flex flex-col gap-3"
            >
                <div class="flex items-center justify-between gap-3">
                    <p v-if="layout.repeat.enabled" class="font-medium">
                        {{ layout.repeat.label }} {{ unit.number }}
                    </p>
                    <Button
                        v-if="layout.repeat.enabled && units.length > 1"
                        type="button"
                        variant="ghost"
                        size="sm"
                        @click="removeUnit(unit.number)"
                    >
                        <Trash2 data-icon="inline-start" aria-hidden="true" />
                        Quitar {{ layout.repeat.label.toLowerCase() }}
                    </Button>
                </div>
                <div
                    v-for="field in layout.header_fields"
                    :key="field.key"
                    class="grid gap-1 sm:grid-cols-[minmax(10rem,1fr)_3fr] sm:items-start sm:gap-3"
                >
                    <label
                        :for="cellId(unit.number, 0, field.key)"
                        class="text-sm font-medium sm:pt-2"
                    >
                        {{ field.label }}
                    </label>
                    <Textarea
                        :id="cellId(unit.number, 0, field.key)"
                        :model-value="
                            String(display(unit.header?.data[field.key]))
                        "
                        rows="2"
                        :aria-invalid="invalid"
                        :placeholder="`Ej. ${field.label}`"
                        @update:model-value="
                            setHeader(
                                unit.number,
                                unit.header,
                                field.key,
                                $event,
                            )
                        "
                    />
                </div>
            </div>

            <div class="overflow-x-auto">
                <table class="w-full border-collapse text-sm">
                    <thead>
                        <tr v-for="(cells, rowIndex) in header" :key="rowIndex">
                            <th
                                v-for="cell in cells"
                                :key="cell.id"
                                scope="col"
                                :colspan="cell.colspan"
                                :rowspan="cell.rowspan"
                                class="border bg-muted px-2 py-1.5 text-center text-xs font-semibold"
                            >
                                {{ cell.label }}
                            </th>
                            <th
                                v-if="rowIndex === 0"
                                scope="col"
                                :rowspan="header.length"
                                class="w-10 border bg-muted"
                            >
                                <span class="sr-only">Acciones</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="(row, rowIndex) in unit.rows"
                            :key="row.id ?? `u${unit.number}-${rowIndex}`"
                        >
                            <td
                                v-for="column in layout.columns"
                                :key="column.key"
                                class="border p-1 align-top"
                                :class="{ 'w-24': column.type === 'number' }"
                            >
                                <Input
                                    v-if="column.type === 'number'"
                                    :id="
                                        cellId(
                                            unit.number,
                                            rowIndex + 1,
                                            column.key,
                                        )
                                    "
                                    type="number"
                                    step="any"
                                    class="h-8 text-center"
                                    :model-value="display(row.data[column.key])"
                                    :aria-label="`${column.label}, fila ${rowIndex + 1}`"
                                    :aria-invalid="invalid"
                                    placeholder="Ej. 2"
                                    @update:model-value="
                                        setCell(
                                            row,
                                            column.key,
                                            $event,
                                            'number',
                                        )
                                    "
                                />
                                <Textarea
                                    v-else
                                    :id="
                                        cellId(
                                            unit.number,
                                            rowIndex + 1,
                                            column.key,
                                        )
                                    "
                                    rows="2"
                                    class="min-h-8"
                                    :model-value="
                                        String(display(row.data[column.key]))
                                    "
                                    :aria-label="`${column.label}, fila ${rowIndex + 1}`"
                                    :aria-invalid="invalid"
                                    :aria-required="required"
                                    :placeholder="`Ej. ${column.label}`"
                                    @update:model-value="
                                        setCell(row, column.key, $event, 'text')
                                    "
                                />
                            </td>
                            <td class="border p-1 text-center align-top">
                                <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="ghost"
                                    :aria-label="`Eliminar fila ${rowIndex + 1}`"
                                    @click="removeRow(row)"
                                >
                                    <Trash2 aria-hidden="true" />
                                </Button>
                            </td>
                        </tr>
                        <tr v-if="layout.totals.enabled">
                            <td
                                v-for="(column, index) in layout.columns"
                                :key="column.key"
                                class="border bg-muted px-2 py-1.5 font-semibold"
                                :class="
                                    index === 0 ? 'text-end' : 'text-center'
                                "
                            >
                                <template v-if="index === 0">
                                    {{ layout.totals.label }}
                                </template>
                                <template v-else-if="column.type === 'number'">
                                    {{
                                        formatSum(
                                            sumColumn(
                                                unit.rows.map(
                                                    (row) => row.data,
                                                ),
                                                column.key,
                                            ),
                                        )
                                    }}
                                </template>
                            </td>
                            <td class="border bg-muted" />
                        </tr>
                    </tbody>
                </table>
            </div>

            <Button
                type="button"
                variant="outline"
                size="sm"
                class="self-start"
                @click="addRow(unit.number)"
            >
                Agregar fila
            </Button>
        </div>

        <Button
            v-if="layout.repeat.enabled"
            type="button"
            variant="outline"
            class="self-start"
            @click="addUnit"
        >
            Agregar {{ layout.repeat.label.toLowerCase() }}
        </Button>
    </div>
</template>
