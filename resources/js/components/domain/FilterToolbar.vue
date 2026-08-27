<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import MobileFilterSheet from '@/components/domain/MobileFilterSheet.vue';
import { FieldGroup } from '@/components/ui/field';

const props = withDefaults(
    defineProps<{
        /**
         * Espera tras la última tecla antes de consultar. Cuatrocientos milisegundos es
         * el punto donde la lista parece reaccionar sola sin lanzar una petición por
         * letra: escribir «coordinador» dispararía once.
         */
        delay?: number;
    }>(),
    {
        delay: 400,
    },
);

let timer: ReturnType<typeof setTimeout> | null = null;

const cancel = (): void => {
    if (timer !== null) {
        clearTimeout(timer);
        timer = null;
    }
};

const submit = (target: EventTarget | null): void => {
    cancel();
    (target as HTMLElement | null)?.closest('form')?.requestSubmit();
};

// Texto: se espera. Cada pulsación reinicia la cuenta, así que solo consulta quien deja
// de escribir.
const onInput = (event: Event): void => {
    cancel();
    const target = event.target;
    timer = setTimeout(() => submit(target), props.delay);
};

/**
 * Elegir en un desplegable es una decisión terminada, no una a medias: consulta en el
 * acto. Se descarta el `change` de los campos de texto, que salta al perder el foco y
 * duplicaría lo que ya tiene turno.
 */
const onChange = (event: Event): void => {
    const target = event.target as HTMLElement | null;

    if (target instanceof HTMLInputElement && target.type !== 'checkbox') {
        return;
    }

    submit(event.target);
};

onBeforeUnmount(cancel);
</script>

<template>
    <FieldGroup
        class="gap-3 lg:flex-row lg:items-end"
        @input="onInput"
        @change="onChange"
    >
        <!-- La búsqueda se queda con el espacio libre: su contenido es texto abierto.
             Los filtros ofrecen opciones cortas y conocidas, así que van a un ancho
             contenido y solo crecen si no caben. -->
        <div class="min-w-0 lg:flex-1">
            <slot name="search" />
        </div>
        <MobileFilterSheet
            class="grid min-w-0 gap-3 sm:grid-cols-2 lg:flex lg:flex-none lg:items-end [&_[data-slot=select-trigger]]:w-full [&>[data-slot=field]]:min-w-0 lg:[&>[data-slot=field]]:w-44"
        >
            <slot name="filters" />
        </MobileFilterSheet>

        <!--
            Sin botón visible, pero el formulario conserva uno: sin ningún `submit`, el
            navegador deja de enviar al pulsar Intro cuando hay más de un campo, y quien
            navegue con teclado se quedaría sin forma de buscar.
        -->
        <button type="submit" class="sr-only" tabindex="-1">Buscar</button>
    </FieldGroup>
</template>
