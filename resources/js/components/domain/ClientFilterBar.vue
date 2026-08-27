<script setup lang="ts">
import { FilterX } from '@lucide/vue';
import type { ComputedRef, Ref } from 'vue';
import MobileFilterSheet from '@/components/domain/MobileFilterSheet.vue';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

const props = defineProps<{
    /** Identifica el campo para su etiqueta; debe ser único en la pantalla. */
    inputId: string;
    placeholder: string;
    /** Rótulo para lectores de pantalla; no se dibuja. */
    label: string;
    /**
     * Lo que devuelve `useClientFilter`. Llega entero en vez de campo por campo: la barra
     * necesita escribir en la búsqueda, saber si hay algo puesto y poder quitarlo todo,
     * y las tres cosas salen del mismo sitio.
     */
    filter: {
        search: Ref<string>;
        active: ComputedRef<boolean>;
        clear: () => void;
    };
}>();

/*
 * El mismo objeto que creó `useClientFilter`, no una copia: escribir aquí es escribir
 * allí. Se toma aparte porque escribir a través de la propiedad parece, leyendo el
 * código, que se está modificando algo que pertenece a quien nos usa.
 */
const search = props.filter.search;
</script>

<template>
    <!--
        Mismo reparto que la barra de las tablas paginadas en servidor, para que las dos
        se lean igual. Aquí no hay formulario: los datos ya están en la página y el filtro
        aplica al escribir, sin consultar nada.
    -->
    <FieldGroup class="gap-3 lg:flex-row lg:items-end">
        <div class="min-w-0 lg:flex-1">
            <Field>
                <FieldLabel :for="inputId" class="sr-only">
                    {{ label }}
                </FieldLabel>
                <Input
                    :id="inputId"
                    v-model="search"
                    type="search"
                    :placeholder="placeholder"
                />
            </Field>
        </div>
        <MobileFilterSheet
            v-if="$slots.filters"
            class="grid min-w-0 gap-3 sm:grid-cols-2 lg:flex lg:flex-none lg:items-end [&_[data-slot=select-trigger]]:w-full [&>[data-slot=field]]:min-w-0 lg:[&>[data-slot=field]]:w-44"
        >
            <slot name="filters" />

            <!--
                Solo cuando hay algo que quitar. Un botón permanente para deshacer algo que
                no se ha hecho ocupa sitio y hace dudar de si estaba filtrando sin querer.
            -->
            <Button
                v-if="filter.active.value"
                type="button"
                variant="ghost"
                class="max-sm:w-full"
                @click="filter.clear()"
            >
                <FilterX data-icon="inline-start" aria-hidden="true" />
                Quitar filtros
            </Button>
        </MobileFilterSheet>
    </FieldGroup>
</template>
