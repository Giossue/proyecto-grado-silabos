<script setup lang="ts">
import { Monitor, Moon, Sun } from '@lucide/vue';
import { computed } from 'vue';
import { Button } from '@/components/ui/button';
import { useAppearance } from '@/composables/useAppearance';

const { appearance, updateAppearance } = useAppearance();

// El orden es el del ciclo: cada pulsación avanza una posición y vuelve al inicio.
// Se conservan las mismas tres opciones que Configuración; reducirlo a dos estados
// dejaría fuera «Sistema» y la preferencia dejaría de coincidir entre ambas pantallas.
const options = [
    { value: 'light', Icon: Sun, label: 'Claro' },
    { value: 'dark', Icon: Moon, label: 'Oscuro' },
    { value: 'system', Icon: Monitor, label: 'Sistema' },
] as const;

const currentIndex = computed(() => {
    const index = options.findIndex(
        (option) => option.value === appearance.value,
    );

    return index === -1 ? 2 : index;
});

const current = computed(() => options[currentIndex.value]);
const next = computed(() => options[(currentIndex.value + 1) % options.length]);

const onCycle = () => {
    updateAppearance(next.value.value);
};
</script>

<template>
    <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        :aria-label="`Tema visual: ${current.label}. Cambiar a ${next.label}`"
        :title="current.label"
        @click="onCycle"
    >
        <component
            :is="current.Icon"
            data-icon="inline-start"
            aria-hidden="true"
        />
    </Button>
</template>
