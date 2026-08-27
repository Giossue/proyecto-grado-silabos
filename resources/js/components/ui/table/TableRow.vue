<script setup lang="ts">
import { Eye } from '@lucide/vue';
import { useMediaQuery } from '@vueuse/core';
import type { HTMLAttributes } from 'vue';
import { computed, inject, nextTick, onMounted, onUpdated, ref, useTemplateRef, watch } from 'vue';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { tableSectionKey } from './context';

// Dos raíces —la fila y su panel—, así que los atributos sueltos se dirigen a mano a la
// fila; el panel no es parte de la tabla y no debe heredarlos.
defineOptions({ inheritAttrs: false });

const props = defineProps<{
    class?: HTMLAttributes['class'];
}>();

const section = inject(tableSectionKey, 'header');

// El corte de Tailwind para `sm`. En pantalla ancha la fila es una fila y nada de lo de
// abajo llega a existir: ni botón, ni panel, ni celdas escondidas.
const narrow = useMediaQuery('(max-width: 639px)');

const isCard = computed(() => section === 'body' && narrow.value);

const row = useTemplateRef<HTMLTableRowElement>('row');
const detail = useTemplateRef<HTMLElement>('detail');

/** Hay datos que la tarjeta no muestra: merece un «Ver más». */
const expandable = ref(false);
const open = ref(false);
/** Primer dato de la fila; encabeza el panel para saber de qué registro se habla. */
const title = ref('');

/** Nombres de columna, en el orden en que aparecen en el encabezado. */
const headings = (node: HTMLElement): string[] =>
    Array.from(
        node
            .closest('table')
            ?.querySelectorAll<HTMLElement>(
                ':scope > thead > tr:last-child > th',
            ) ?? [],
    ).map((head) => head.textContent?.trim() ?? '');

const cellsOf = (node: HTMLElement): HTMLTableCellElement[] =>
    Array.from(
        node.querySelectorAll<HTMLTableCellElement>(':scope > td'),
    ).filter((cell) => !('cardMore' in cell.dataset));

/**
 * Copia a cada celda el nombre de su columna y decide cuáles se quedan en la tabla.
 *
 * El nombre ya está escrito una vez en el encabezado; repetirlo en cada celda de las
 * dieciocho tablas sería copiar cien veces algo que puede leerse de donde ya está, y
 * dejaría a la siguiente tabla dependiendo de que alguien se acuerde de hacerlo.
 */
const annotate = (): void => {
    const node = row.value;

    if (node === null || !isCard.value) {
        return;
    }

    const cells = cellsOf(node);
    const names = headings(node);

    // Fila de «no hay resultados»: ocupa todas las columnas y no describe un registro.
    if (cells.length === 1 && cells[0].hasAttribute('colspan')) {
        expandable.value = false;

        return;
    }

    // Las dos primeras columnas se quedan: la primera identifica la fila y la segunda es
    // la que suele decidir si esa fila interesa. El resto cabe de sobra en el panel.
    const KEPT = 2;
    const hidden = cells.filter(
        (cell, index) =>
            index >= KEPT &&
            cell.querySelector('[data-slot="table-actions"]') === null,
    ).length;

    /*
     * El menú de acciones se va al panel solo si ya hay algo que ir a ver. En una tabla
     * corta, esconderlo obligaría a abrir el panel para llegar a lo único que había.
     */
    const foldActions = hidden > 0;

    cells.forEach((cell, index) => {
        cell.dataset.cardIndex = String(index);

        if (cell.querySelector('[data-slot="table-actions"]') !== null) {
            cell.dataset.cardRole = 'actions';
            cell.dataset.cardHidden = foldActions ? 'true' : 'false';

            return;
        }

        cell.dataset.label = names[index] ?? '';
        cell.dataset.cardHidden = index >= KEPT ? 'true' : 'false';
    });

    // El encabezado esconde las mismas columnas: una cabecera sin celdas debajo dejaría
    // la tabla descuadrada.
    Array.from(
        node
            .closest('table')
            ?.querySelectorAll<HTMLElement>(
                ':scope > thead > tr:last-child > th',
            ) ?? [],
    ).forEach((head, index) => {
        head.dataset.cardHidden = cells[index]?.dataset.cardHidden ?? 'false';
    });

    expandable.value = hidden > 0;
    title.value = cells[0]?.textContent?.trim() ?? '';
};

/** El panel repite las celdas: las suyas necesitan su propio rótulo y sin esconder nada. */
const annotateDetail = (): void => {
    const node = detail.value;

    if (node === null || row.value === null) {
        return;
    }

    const names = headings(row.value);

    cellsOf(node).forEach((cell, index) => {
        cell.dataset.cardIndex = String(index);
        cell.dataset.cardHidden = 'false';

        if (cell.querySelector('[data-slot="table-actions"]') !== null) {
            cell.dataset.cardRole = 'actions';

            return;
        }

        cell.dataset.label = names[index] ?? '';
    });
};

onMounted(() => {
    void nextTick(annotate);
});

// Llega otra página de resultados o cambia un filtro: las celdas son otras.
onUpdated(annotate);

watch(open, (isOpen) => {
    if (isOpen) {
        void nextTick(annotateDetail);
    }
});
</script>

<template>
    <tr
        ref="row"
        v-bind="$attrs"
        data-slot="table-row"
        :class="
            cn(
                'hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors',
                props.class,
            )
        "
    >
        <slot />

        <!--
            Columna que solo existe en pantalla estrecha, al final de la fila y sin
            encabezado propio: no es un dato, es la puerta al resto de la fila.
        -->
        <td v-if="isCard && expandable" data-card-more class="p-1">
            <Button
                type="button"
                variant="ghost"
                size="sm"
                class="whitespace-nowrap"
                @click="open = true"
            >
                Ver más
                <Eye aria-hidden="true" />
            </Button>
        </td>
    </tr>

    <!--
        El panel vuelve a dibujar las mismas celdas en vez de copiar su texto. Copiarlo
        dejaría los enlaces muertos y el menú de acciones sin efecto: lo que se vería
        sería una fotografía de la fila, no la fila.
    -->
    <Sheet v-if="isCard && expandable" v-model:open="open">
        <SheetContent
            side="bottom"
            class="max-h-[85vh] gap-0 overflow-y-auto rounded-t-xl px-5 pt-5 pb-8"
        >
            <SheetHeader class="p-0 pr-8 pb-1">
                <SheetTitle class="text-left">{{ title }}</SheetTitle>
                <SheetDescription class="sr-only">
                    Todos los datos de la fila y sus acciones.
                </SheetDescription>
            </SheetHeader>
            <!--
                Fuera de la tabla las celdas pierden el tamaño de letra que les daba la
                tabla y cada dato se dibujaba más grande que en la lista. Aquí se les
                devuelve, para que el panel y la fila se lean igual.
            -->
            <div ref="detail" data-card-detail class="text-sm">
                <slot />
            </div>
        </SheetContent>
    </Sheet>
</template>
