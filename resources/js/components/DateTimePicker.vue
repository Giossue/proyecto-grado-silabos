<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import DatePicker from '@/components/DatePicker.vue';
import { Input } from '@/components/ui/input';

/*
 * Fecha y hora con los componentes compartidos: el calendario de `DatePicker` para el
 * día y un campo de hora `hh:mm` para la hora, que es lo que hace el propio patrón de
 * shadcn. Nada de listas de veinticuatro horas y doce minutos: se escribe la hora.
 *
 * El valor viaja como `aaaa-mm-ddThh:mm` —lo mismo que enviaba el campo nativo
 * `datetime-local`—, así que el servidor no nota el cambio.
 */
const props = withDefaults(
    defineProps<{
        /** Asocia el calendario con su rótulo; debe ser único en la pantalla. */
        id: string;
        /** Nombre con el que viaja el valor al enviar el formulario. */
        name: string;
        /** Valor inicial en ISO 8601 o `aaaa-mm-ddThh:mm`, en la hora local. */
        defaultValue?: string;
        required?: boolean;
        ariaInvalid?: boolean;
    }>(),
    { defaultValue: undefined, required: false, ariaInvalid: false },
);

const pad = (value: number): string => String(value).padStart(2, '0');

const initial = (() => {
    if (!props.defaultValue) {
        return { date: '', time: '08:00' };
    }

    const parsed = new Date(props.defaultValue);

    return {
        date: `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`,
        time: `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`,
    };
})();

const date = ref(initial.date);
const time = ref(initial.time);

const value = computed(() =>
    date.value && time.value ? `${date.value}T${time.value}` : '',
);

// Los filtros y formularios escuchan cambios en el campo oculto igual que en un nativo.
const hidden = ref<HTMLInputElement | null>(null);
watch(value, () => {
    hidden.value?.dispatchEvent(new Event('change', { bubbles: true }));
});
</script>

<template>
    <div
        data-slot="datetime-picker"
        class="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2"
    >
        <input ref="hidden" type="hidden" :name="name" :value="value" />
        <DatePicker
            :id="id"
            v-model="date"
            :required="required"
            :aria-invalid="ariaInvalid"
            placeholder="Elegir día"
        />
        <Input
            v-model="time"
            type="time"
            step="60"
            :aria-label="`Hora para ${id}`"
            :aria-invalid="ariaInvalid"
            :required="required"
        />
    </div>
</template>
