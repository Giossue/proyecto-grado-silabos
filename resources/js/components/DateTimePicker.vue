<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import DatePicker from '@/components/DatePicker.vue';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

/*
 * Fecha y hora con los componentes compartidos: el calendario de `DatePicker` para el
 * día y dos listas para hora y minutos. El campo nativo `datetime-local` dibujaba el
 * selector del navegador, distinto en cada equipo y ajeno al resto de la interfaz.
 *
 * El valor viaja como `aaaa-mm-ddThh:mm` —lo mismo que enviaba el campo nativo—, así
 * que el servidor no nota el cambio.
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
        return { date: '', hour: '08', minute: '00' };
    }

    const parsed = new Date(props.defaultValue);

    return {
        date: `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`,
        hour: pad(parsed.getHours()),
        minute: pad(Math.floor(parsed.getMinutes() / 5) * 5),
    };
})();

const date = ref(initial.date);
const hour = ref(initial.hour);
const minute = ref(initial.minute);

const hours = Array.from({ length: 24 }, (_, index) => pad(index));
const minutes = Array.from({ length: 12 }, (_, index) => pad(index * 5));

const value = computed(() =>
    date.value ? `${date.value}T${hour.value}:${minute.value}` : '',
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
        class="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2"
    >
        <input ref="hidden" type="hidden" :name="name" :value="value" />
        <DatePicker
            :id="id"
            v-model="date"
            :required="required"
            :aria-invalid="ariaInvalid"
            placeholder="Elegir día"
        />
        <Select v-model="hour">
            <SelectTrigger
                :aria-label="`Hora para ${id}`"
                :aria-invalid="ariaInvalid"
                class="w-20"
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectGroup>
                    <SelectItem
                        v-for="option in hours"
                        :key="option"
                        :value="option"
                    >
                        {{ option }} h
                    </SelectItem>
                </SelectGroup>
            </SelectContent>
        </Select>
        <Select v-model="minute">
            <SelectTrigger
                :aria-label="`Minutos para ${id}`"
                :aria-invalid="ariaInvalid"
                class="w-20"
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectGroup>
                    <SelectItem
                        v-for="option in minutes"
                        :key="option"
                        :value="option"
                    >
                        {{ option }} min
                    </SelectItem>
                </SelectGroup>
            </SelectContent>
        </Select>
    </div>
</template>
