<script setup lang="ts">
import { Link, usePage } from '@inertiajs/vue3';
import { computed } from 'vue';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { dashboard } from '@/routes';

/**
 * Puesta en marcha en el encabezado: barra corta con color según lo que falta y el
 * conteo. Lleva al Panel, donde está la lista de pasos. Desaparece al 100 % y vuelve
 * si algo se borra, porque el servidor la recalcula en cada petición.
 */
const page = usePage();
const progress = computed(() => page.props.setupProgress ?? null);
const percent = computed(() => {
    const value = progress.value;

    return value === null || value.total === 0
        ? 100
        : Math.round((value.done / value.total) * 100);
});
const visible = computed(
    () =>
        progress.value !== null &&
        progress.value.total > 0 &&
        progress.value.done < progress.value.total,
);
const tone = computed(() =>
    percent.value < 34
        ? 'bg-destructive'
        : percent.value < 67
          ? 'bg-amber-500'
          : 'bg-emerald-600',
);
</script>

<template>
    <Tooltip v-if="visible && progress">
        <TooltipTrigger as-child>
            <Link
                :href="dashboard()"
                class="flex h-8 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground tabular-nums hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                :aria-label="`Configuración del sistema: ${progress.done} de ${progress.total} pasos`"
            >
                <span
                    class="h-1.5 w-20 overflow-hidden rounded-full bg-muted"
                    aria-hidden="true"
                >
                    <span
                        class="block h-full rounded-full transition-[width]"
                        :class="tone"
                        :style="{ width: `${percent}%` }"
                    />
                </span>
                <span>{{ progress.done }}/{{ progress.total }}</span>
            </Link>
        </TooltipTrigger>
        <TooltipContent>Configuración del sistema</TooltipContent>
    </Tooltip>
</template>
