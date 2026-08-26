<script setup lang="ts">
import { Search } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup } from '@/components/ui/field';

withDefaults(
    defineProps<{
        submitLabel?: string;
    }>(),
    {
        submitLabel: 'Aplicar filtros',
    },
);
</script>

<template>
    <FieldGroup class="gap-3 lg:flex-row lg:items-end">
        <!-- La búsqueda se queda con el espacio libre: su contenido es texto abierto.
             Los filtros ofrecen opciones cortas y conocidas, así que van a un ancho
             contenido y solo crecen si no caben. -->
        <div class="min-w-0 lg:flex-1">
            <slot name="search" />
        </div>
        <div
            class="grid min-w-0 gap-3 sm:grid-cols-2 lg:flex lg:flex-none lg:items-end [&_[data-slot=select-trigger]]:w-full [&>[data-slot=field]]:min-w-0 lg:[&>[data-slot=field]]:w-44"
        >
            <slot name="filters" />
        </div>
        <Field class="lg:w-auto">
            <Button type="submit" class="w-full lg:min-w-36">
                <Search data-icon="inline-start" aria-hidden="true" />
                {{ submitLabel }}
            </Button>
        </Field>
    </FieldGroup>
</template>
