<script setup lang="ts">
import type { CSSProperties } from 'vue';

/*
 * Leyenda de relaciones y de unidades de organización curricular, más el resumen
 * de totales. Vive aparte porque se dibuja en dos sitios: el panel flotante del
 * lienzo en pantalla ancha y el desplegable del botón en móvil.
 */
defineProps<{
    units: { unit: string; style: CSSProperties }[];
    rows: { id: string; label: string; value: string }[];
}>();
</script>

<template>
    <div class="flex flex-col gap-2 text-xs">
        <dl class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
                <dt
                    class="h-0.5 w-5 shrink-0 rounded bg-destructive"
                    aria-hidden="true"
                ></dt>
                <dd>Prerrequisito</dd>
            </div>
            <div class="flex items-center gap-2">
                <dt
                    class="h-0.5 w-5 shrink-0 rounded bg-primary"
                    aria-hidden="true"
                ></dt>
                <dd>Correquisito</dd>
            </div>
        </dl>
        <dl v-if="units.length > 0" class="flex flex-col gap-1 border-t pt-2">
            <div
                v-for="item in units"
                :key="item.unit"
                class="flex items-center gap-2"
            >
                <dt
                    class="size-3 shrink-0 rounded-sm"
                    :style="item.style"
                    aria-hidden="true"
                ></dt>
                <dd class="truncate">{{ item.unit }}</dd>
            </div>
        </dl>
        <dl class="flex flex-col gap-1 border-t pt-2">
            <div
                v-for="row in rows"
                :key="row.id"
                class="flex items-center justify-between gap-3"
            >
                <dt class="truncate text-muted-foreground">{{ row.label }}</dt>
                <dd class="font-medium">{{ row.value }}</dd>
            </div>
        </dl>
    </div>
</template>
