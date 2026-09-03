<script setup lang="ts">
/**
 * Ficha de identificación institucional: la primera tabla del sílabo. Datos
 * maestros en pares etiqueta/valor, uno o dos por fila, con el dibujo del impreso.
 */
export type IdentificationPair = { label: string; value: string };

defineProps<{
    rows: IdentificationPair[][];
}>();
</script>

<template>
    <table class="id-card">
        <tbody>
            <tr v-for="(pairs, rowIndex) in rows" :key="rowIndex">
                <template v-for="(pair, pairIndex) in pairs" :key="pairIndex">
                    <th scope="row" class="id-label">{{ pair.label }}</th>
                    <td class="id-value" :colspan="pairs.length === 1 ? 3 : 1">
                        {{ pair.value }}
                    </td>
                </template>
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
    width: 100%;
}

.id-card th,
.id-card td {
    border: 1px solid #7f7f7f;
    padding: 3pt 5pt;
    text-align: left;
    vertical-align: top;
}

.id-label {
    background: #dbe5f1;
    color: #1f497d;
    font-weight: 700;
    text-transform: uppercase;
    width: 22%;
}

.id-value {
    background: #fff;
    color: #000;
}
</style>
