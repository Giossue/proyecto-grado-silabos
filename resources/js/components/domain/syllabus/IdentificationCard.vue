<script setup lang="ts">
/**
 * Ficha de identificación institucional, calcada del formato oficial: nueve
 * columnas y celdas combinadas por fila. La cuadrícula la arma el servidor
 * (`IdentificationCard::grid`); aquí solo se dibuja.
 */
export type IdentificationCell = {
    text: string;
    span: number;
    rows: number;
    style: 'blue' | 'shade' | 'plain';
    bold: boolean;
    small: boolean;
    center: boolean;
};

const WIDTHS = [15.9, 9.4, 4.6, 3.7, 8.5, 4.3, 13.8, 16.5, 23.2];

defineProps<{
    grid: IdentificationCell[][];
}>();
</script>

<template>
    <table class="id-card">
        <colgroup>
            <col
                v-for="(width, index) in WIDTHS"
                :key="index"
                :style="{ width: `${width}%` }"
            />
        </colgroup>
        <tbody>
            <tr v-for="(cells, rowIndex) in grid" :key="rowIndex">
                <td
                    v-for="(cell, cellIndex) in cells"
                    :key="cellIndex"
                    :colspan="cell.span"
                    :rowspan="cell.rows"
                    :class="[
                        `id-${cell.style}`,
                        {
                            'id-bold': cell.bold,
                            'id-small': cell.small,
                            'id-center': cell.center,
                        },
                    ]"
                >
                    <template v-if="cell.text.includes('\n')">
                        <strong>{{ cell.text.split('\n')[0] }}</strong>
                        <br />
                        {{ cell.text.split('\n').slice(1).join('\n') }}
                    </template>
                    <template v-else>{{ cell.text }}</template>
                </td>
            </tr>
        </tbody>
    </table>
</template>

<style scoped>
/* Colores fijos: representan papel, no la interfaz. */
.id-card {
    border-collapse: collapse;
    font-size: 9pt;
    margin: 0 0 6pt;
    table-layout: fixed;
    width: 100%;
}

.id-card td {
    border: 1px solid #7f7f7f;
    color: #000;
    padding: 2pt 4pt;
    text-align: left;
    vertical-align: middle;
    white-space: pre-line;
    word-wrap: break-word;
}

.id-blue {
    background: #4f81bd;
    color: #fff !important;
}

.id-shade {
    background: #dbe5f1;
}

.id-plain {
    background: #fff;
}

.id-bold {
    font-weight: 700;
}

.id-small {
    font-size: 7pt;
    line-height: 1.15;
}

.id-center {
    text-align: center;
}
</style>
