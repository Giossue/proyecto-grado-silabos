<script setup lang="ts">
import {
    BaseEdge,
    EdgeLabelRenderer,
    getSmoothStepPath,
    useVueFlow,
} from '@vue-flow/core';
import type { EdgeProps } from '@vue-flow/core';
import { computed, ref } from 'vue';

const props = defineProps<
    EdgeProps<{
        label: string;
        // Separa las líneas que comparten materia de salida o llegada: cada una
        // se desplaza horizontalmente para que no se pisen en el conector.
        sourceOffset: number;
        targetOffset: number;
    }>
>();

const { screenToFlowCoordinate } = useVueFlow();

const pathData = computed(() =>
    getSmoothStepPath({
        sourceX: props.sourceX + props.data.sourceOffset,
        sourceY: props.sourceY,
        sourcePosition: props.sourcePosition,
        targetX: props.targetX + props.data.targetOffset,
        targetY: props.targetY,
        targetPosition: props.targetPosition,
    }),
);
const path = computed(() => pathData.value[0]);

// La etiqueta sigue al cursor sobre la línea: en el punto medio fijo quedaba
// oculta cuando la trayectoria pasaba por detrás de una tarjeta.
const hoverPoint = ref<{ x: number; y: number } | null>(null);

const onHoverMove = (event: MouseEvent): void => {
    hoverPoint.value = screenToFlowCoordinate({
        x: event.clientX,
        y: event.clientY,
    });
};

// Con teclado no hay cursor: la etiqueta se ancla al centro de la trayectoria.
const onFocusIn = (): void => {
    hoverPoint.value = { x: pathData.value[1], y: pathData.value[2] };
};
</script>

<template>
    <g
        class="cursor-pointer"
        @mouseenter="onHoverMove"
        @mousemove="onHoverMove"
        @mouseleave="hoverPoint = null"
        @focusin="onFocusIn"
        @focusout="hoverPoint = null"
    >
        <BaseEdge
            :id="id"
            :path="path"
            :style="style"
            :marker-end="markerEnd"
            :interaction-width="24"
        />
    </g>
    <EdgeLabelRenderer>
        <div
            v-if="hoverPoint"
            class="pointer-events-none absolute z-10 rounded-md bg-card px-2 py-1 text-[10px] text-card-foreground shadow-menu ring-1 ring-surface-ring"
            :style="{
                transform: `translate(-50%, -150%) translate(${hoverPoint.x}px, ${hoverPoint.y}px)`,
            }"
        >
            {{ data.label }}
        </div>
    </EdgeLabelRenderer>
</template>
