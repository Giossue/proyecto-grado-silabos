<script setup lang="ts">
import {
    DateFormatter,
    getLocalTimeZone,
    parseDate,
} from '@internationalized/date';
import { CalendarDays, X } from '@lucide/vue';
import type { DateValue } from 'reka-ui';
import { computed, useTemplateRef } from 'vue';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const props = withDefaults(
    defineProps<{
        /** Asocia el campo con su rótulo; debe ser único en la pantalla. */
        id: string;
        /** Nombre con el que viaja el valor al enviar el formulario. */
        name?: string;
        /** Valor inicial en `aaaa-mm-dd`, tal como lo devuelve el servidor. */
        defaultValue?: string;
        /** El calendario no ofrece «Quitar fecha» cuando el dato es obligatorio. */
        required?: boolean;
        ariaInvalid?: boolean;
        disabled?: boolean;
        placeholder?: string;
    }>(),
    {
        name: undefined,
        defaultValue: undefined,
        required: false,
        ariaInvalid: false,
        disabled: false,
        placeholder: 'Elegir fecha',
    },
);

/**
 * El valor se guarda en `aaaa-mm-dd`, que es lo que espera el servidor y lo que ya
 * viajaba en el campo nativo. El calendario trabaja con su propio tipo de fecha, así que
 * la conversión ocurre aquí y no en cada formulario.
 */
const model = defineModel<string | undefined>({ default: undefined });

if (model.value === undefined) {
    model.value = props.defaultValue ?? '';
}

const root = useTemplateRef<HTMLElement>('root');

// Fechas cortas y en español: «27 ago 2026». La forma larga desbordaba el botón en un
// móvil, y la numérica se confunde entre día y mes.
const formatter = new DateFormatter('es-EC', { dateStyle: 'medium' });

const parse = (value: string | undefined): DateValue | undefined => {
    if (value === undefined || value === '') {
        return undefined;
    }

    try {
        return parseDate(value);
    } catch {
        // Un valor guardado a mano o corrupto no debe dejar la pantalla en blanco.
        return undefined;
    }
};

const selected = computed<DateValue | undefined>({
    get: () => parse(model.value),
    set: (value) => {
        model.value = value?.toString() ?? '';

        /*
         * Las barras de filtros consultan solas al cambiar un campo, y escuchan el evento
         * que emiten los campos nativos. Este no lo es, así que lo emite él: sin esto,
         * elegir una fecha en Auditoría no filtraría nada hasta tocar otra cosa.
         */
        root.value?.dispatchEvent(new Event('change', { bubbles: true }));
    },
});

const label = computed(() => {
    const value = selected.value;

    return value === undefined
        ? props.placeholder
        : formatter.format(value.toDate(getLocalTimeZone()));
});

const clear = (): void => {
    selected.value = undefined;
};
</script>

<template>
    <div ref="root" data-slot="date-picker">
        <!--
            El valor viaja en un campo oculto porque los formularios de la aplicación se
            envían con los nombres de sus campos, no con un objeto en memoria.
        -->
        <input v-if="name" type="hidden" :name="name" :value="model" />

        <Popover>
            <PopoverTrigger as-child>
                <Button
                    :id="id"
                    type="button"
                    variant="outline"
                    :disabled="disabled"
                    :aria-invalid="ariaInvalid"
                    :class="
                        cn(
                            'w-full justify-start font-normal',
                            selected === undefined && 'text-muted-foreground',
                        )
                    "
                >
                    <CalendarDays data-icon="inline-start" aria-hidden="true" />
                    {{ label }}
                </Button>
            </PopoverTrigger>
            <PopoverContent class="w-auto p-0" align="start">
                <Calendar
                    v-model="selected"
                    locale="es-EC"
                    initial-focus
                    class="p-3"
                />

                <!-- Una fecha opcional tiene que poder deshacerse: sin esto, elegir una
                     por error dejaría el dato puesto para siempre. -->
                <div
                    v-if="!required && selected !== undefined"
                    class="border-t p-2"
                >
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        class="w-full justify-center"
                        @click="clear"
                    >
                        <X data-icon="inline-start" aria-hidden="true" />
                        Quitar fecha
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    </div>
</template>
