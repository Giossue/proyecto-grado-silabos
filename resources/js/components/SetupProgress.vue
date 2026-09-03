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
/** Color según lo que falta; también tiñe el conteo para que se lea aun al 0 %. */
const tone = computed(() =>
    percent.value < 34
        ? { bar: 'bg-destructive', text: 'text-destructive' }
        : percent.value < 67
          ? { bar: 'bg-amber-500', text: 'text-amber-600' }
          : { bar: 'bg-emerald-600', text: 'text-emerald-700' },
);
</script>

<template>
    <Tooltip v-if="visible && progress">
        <TooltipTrigger as-child>
            <Link
                :href="dashboard()"
                class="flex h-8 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground tabular-nums hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
                <span
                    class="h-1.5 w-20 overflow-hidden rounded-full bg-muted"
                    aria-hidden="true"
                >
                    <span
                        class="block h-full rounded-full transition-[width]"
                        :class="tone.bar"
                        :style="{ width: `${percent}%` }"
                    />
                </span>
                <span class="font-medium" :class="tone.text">
                    {{ progress.done }}/{{ progress.total }}
                </span>
                <span class="sr-only">
                    pasos de configuración del sistema completados
                </span>
            </Link>
        </TooltipTrigger>
        <TooltipContent>Configuración del sistema</TooltipContent>
    </Tooltip>
</template>
