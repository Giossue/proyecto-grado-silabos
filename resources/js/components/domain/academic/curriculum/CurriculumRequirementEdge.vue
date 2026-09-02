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

/*
 * Un quiebre solo se justifica cuando hay que esquivar algo. Si los dos extremos
 * quedan a menos de un reparto de distancia —el desplazamiento que separa las
 * líneas que comparten conector—, el rodeo no evita nada: se alinean al extremo de
 * llegada, que es donde importa que las puntas de flecha no se solapen, y la línea
 * baja recta.
 */
const ALIGNMENT_TOLERANCE = 24;

const endpoints = computed(() => {
    const sourceX = props.sourceX + props.data.sourceOffset;
    const targetX = props.targetX + props.data.targetOffset;

    return Math.abs(sourceX - targetX) <= ALIGNMENT_TOLERANCE
        ? { sourceX: targetX, targetX }
        : { sourceX, targetX };
});

const pathData = computed(() =>
    getSmoothStepPath({
        sourceX: endpoints.value.sourceX,
        sourceY: props.sourceY,
        sourcePosition: props.sourcePosition,
        targetX: endpoints.value.targetX,
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
        class="cursor-pointer focus:outline-none"
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
