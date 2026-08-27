<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { computed, useTemplateRef } from 'vue';
import { useHorizontalOverflow } from '@/composables/useHorizontalOverflow';
import { cn } from '@/lib/utils';

const props = defineProps<{
    class?: HTMLAttributes['class'];
    /** Describe la tabla para quien la recorra con teclado o lector de pantalla. */
    label?: string;
}>();

const container = useTemplateRef<HTMLElement>('container');
const { canScrollLeft, canScrollRight, overflows } =
    useHorizontalOverflow(container);

const region = computed(
    () => props.label ?? 'Tabla con desplazamiento horizontal',
);
</script>

<template>
    <div class="relative w-full">
        <!--
            `tabindex` solo cuando desborda: una región desplazable tiene que poder
            recorrerse con el teclado, pero añadir una parada de tabulación en una tabla
            que cabe entera sería ruido para quien navegue así.
        -->
        <div
            ref="container"
            data-slot="table-container"
            class="w-full overflow-x-auto overflow-y-hidden [scrollbar-color:var(--color-border)_transparent] [scrollbar-width:thin]"
            :tabindex="overflows ? 0 : undefined"
            :role="overflows ? 'region' : undefined"
            :aria-label="overflows ? region : undefined"
        >
            <table
                data-slot="table"
                :class="cn('w-full caption-bottom text-sm', props.class)"
            >
                <slot />
            </table>
        </div>

        <!--
            Degradados en los bordes por los que aún hay datos. En un móvil la barra de
            desplazamiento no se dibuja hasta que alguien la arrastra, así que sin esta
            señal una columna cortada parece un defecto y no una invitación a deslizar.
            No capturan el puntero para no robarle el gesto a la tabla.
        -->
        <div
            v-show="canScrollLeft"
            class="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-card to-transparent"
            aria-hidden="true"
        />
        <div
            v-show="canScrollRight"
            class="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent"
            aria-hidden="true"
        />
    </div>
</template>
