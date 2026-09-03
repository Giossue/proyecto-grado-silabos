<script setup lang="ts">
import { computed } from 'vue';
import {
    formatSum,
    groupByUnit,
    headerRows,
    sumColumn,
    columnWidths,
    totalizes,
} from '@/lib/tableLayout';
import type { TableLayout, TableRowData } from '@/lib/tableLayout';

/** Tabla del sílabo en solo lectura, con el mismo dibujo que el documento impreso. */
const props = defineProps<{
    layout: TableLayout;
    rows: { id: string | null; data: TableRowData }[];
}>();

const header = computed(() => headerRows(props.layout));
const units = computed(() =>
    groupByUnit(props.rows, props.layout.repeat.enabled),
);

const display = (value: TableRowData[string]): string =>
    value === null || value === undefined ? '' : String(value);
const widths = computed(() => columnWidths(props.layout));
</script>

<template>
    <div class="flex flex-col gap-4">
        <table
            v-for="unit in units"
            :key="unit.number"
            class="w-full border-collapse text-sm"
        >
            <colgroup v-if="widths">
                <col
                    v-for="(width, index) in widths"
                    :key="index"
                    :style="{ width }"
                />
            </colgroup>
            <tbody
                v-if="layout.repeat.enabled || layout.header_fields.length > 0"
            >
                <tr v-if="layout.repeat.enabled">
                    <th
                        scope="row"
                        class="w-1/4 border bg-[#DBE5F1] px-3 py-1.5 text-start font-semibold text-[#365F91]"
                    >
                        {{ layout.repeat.label }} No.
                    </th>
                    <td
                        class="border px-3 py-1.5"
                        :colspan="Math.max(1, layout.columns.length - 1)"
                    >
                        {{ unit.number }}
                    </td>
                </tr>
                <tr v-for="field in layout.header_fields" :key="field.key">
                    <th
                        scope="row"
                        class="w-1/4 border bg-[#DBE5F1] px-3 py-1.5 text-start font-semibold text-[#365F91]"
                    >
                        {{ field.label }}
                    </th>
                    <td
                        class="border px-3 py-1.5 whitespace-pre-wrap"
                        :colspan="Math.max(1, layout.columns.length - 1)"
                    >
                        {{ display(unit.header?.data[field.key]) }}
                    </td>
                </tr>
            </tbody>
            <thead>
                <tr v-for="(cells, rowIndex) in header" :key="rowIndex">
                    <th
                        v-for="cell in cells"
                        :key="cell.id"
                        scope="col"
                        :colspan="cell.colspan"
                        :rowspan="cell.rowspan"
                        class="border bg-[#DBE5F1] px-3 py-1.5 text-center font-semibold text-[#365F91]"
                    >
                        {{ cell.label }}
                    </th>
                </tr>
            </thead>
            <tbody>
                <tr v-if="unit.rows.length === 0">
                    <td
                        :colspan="layout.columns.length"
                        class="border px-3 py-1.5 text-muted-foreground italic"
                    >
                        Sin filas
                    </td>
                </tr>
                <tr
                    v-for="row in unit.rows"
                    :key="row.id ?? JSON.stringify(row.data)"
                >
                    <td
                        v-for="column in layout.columns"
                        :key="column.key"
                        class="border px-3 py-1.5 align-top whitespace-pre-wrap"
                        :class="{ 'text-center': column.type === 'number' }"
                    >
                        {{ display(row.data[column.key]) }}
                    </td>
                </tr>
                <tr v-if="layout.totals.enabled">
                    <td
                        v-for="(column, index) in layout.columns"
                        :key="column.key"
                        class="border bg-[#B8CCE4] px-3 py-1.5 font-semibold text-[#365F91]"
                        :class="index === 0 ? 'text-end' : 'text-center'"
                    >
                        <template v-if="index === 0">
                            {{ layout.totals.label }}
                        </template>
                        <template v-else-if="totalizes(column)">
                            {{
                                formatSum(
                                    sumColumn(
                                        unit.rows.map((row) => row.data),
                                        column.key,
                                    ),
                                )
                            }}
                        </template>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>
