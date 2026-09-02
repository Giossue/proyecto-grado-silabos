<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue';
import { computed } from 'vue';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAppearance } from '@/composables/useAppearance';

const { appearance, updateAppearance } = useAppearance();

// Solo dos temas, claro y oscuro, en el mismo orden que Configuración. No existe la
// opción «Sistema»: la aplicación arranca en claro y solo cambia cuando la persona pulsa.
const options = [
    { value: 'light', Icon: Sun, label: 'Claro' },
    { value: 'dark', Icon: Moon, label: 'Oscuro' },
] as const;

const currentIndex = computed(() => {
    const index = options.findIndex(
        (option) => option.value === appearance.value,
    );

    return index === -1 ? 0 : index;
});

const current = computed(() => options[currentIndex.value]);
const next = computed(() => options[(currentIndex.value + 1) % options.length]);

const onCycle = () => {
    updateAppearance(next.value.value);
};
</script>

<template>
    <TooltipProvider>
        <Tooltip>
            <TooltipTrigger as-child>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    :aria-label="`Tema visual: ${current.label}. Cambiar a ${next.label}`"
                    @click="onCycle"
                >
                    <component
                        :is="current.Icon"
                        data-icon="inline-start"
                        aria-hidden="true"
                    />
                </Button>
            </TooltipTrigger>
            <TooltipContent>Tema: {{ current.label }}</TooltipContent>
        </Tooltip>
    </TooltipProvider>
</template>
