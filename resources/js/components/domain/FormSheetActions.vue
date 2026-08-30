<script setup lang="ts">
import { Check } from '@lucide/vue';
import type { Component } from 'vue';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { SheetFooter } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';

withDefaults(
    defineProps<{
        /** Texto del botón principal. Describe lo que va a ocurrir, no «Aceptar». */
        label: string;
        /** Cierra el panel sin enviar. Llega del slot de `FormSheet`. */
        close: () => void;
        processing?: boolean;
        /** Icono del botón principal; refuerza la acción antes de leerla. */
        icon?: Component;
        /** Deshabilita el envío por una razón propia del formulario. */
        disabled?: boolean;
    }>(),
    {
        processing: false,
        icon: () => Check,
        disabled: false,
    },
);
</script>

<template>
    <!--
        Cancelar primero y acción después: se lee de izquierda a derecha y la última
        parada es la que confirma. Cancelar no lleva icono ni color de acción para que
        entre las dos no haya duda de cuál es cuál.
    -->
    <SheetFooter
        class="fixed inset-x-0 bottom-0 border-t bg-card pb-[calc(1rem+env(safe-area-inset-bottom))] sm:left-auto sm:max-w-lg"
    >
        <Field orientation="horizontal" class="justify-end">
            <Button type="button" variant="outline" @click="close">
                Cancelar
            </Button>
            <Button type="submit" :disabled="processing || disabled">
                <Spinner v-if="processing" data-icon="inline-start" />
                <component
                    :is="icon"
                    v-else
                    data-icon="inline-start"
                    aria-hidden="true"
                />
                {{ label }}
            </Button>
        </Field>
    </SheetFooter>
</template>
