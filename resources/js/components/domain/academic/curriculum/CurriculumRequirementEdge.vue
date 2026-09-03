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
        /** Correquisito del mismo nivel: la línea pasa por encima, no por debajo. */
        sameLevel: boolean;
    }>
>();

// Cuánto sube la línea sobre el borde superior de las tarjetas del mismo nivel.
const OVERPASS_RISE = 18;

const { screenToFlowCoordinate } = useVueFlow();

/*
 * Un quiebre solo se justifica cuando hay que esquivar algo. Si los dos extremos
 * quedan a menos de un reparto de distancia —el desplazamiento que separa las líneas
 * que comparten conector—, el rodeo no evita nada: la línea baja recta desde donde
 * sale. Manda la salida y no la llegada: una materia con una sola línea debe verse
 * salir de su centro, y la punta cae donde esa vertical llegue.
 */
const ALIGNMENT_TOLERANCE = 24;

const endpoints = computed(() => {
    const sourceX = props.sourceX + props.data.sourceOffset;
    const targetX = props.targetX + props.data.targetOffset;

    return Math.abs(sourceX - targetX) <= ALIGNMENT_TOLERANCE
        ? { sourceX, targetX: sourceX }
        : { sourceX, targetX };
});

const pathData = computed((): [string, number, number] => {
    if (props.data.sameLevel) {
        // Ambas tarjetas comparten altura: el borde superior de la salida está a la
        // misma Y que el conector de llegada. Sube, cruza y baja, con punta en ambos.
        const top = props.targetY;
        const rise = top - OVERPASS_RISE;
        const sourceX = props.sourceX;
        const targetX = props.targetX + props.data.targetOffset;

        return [
            `M ${sourceX} ${top} V ${rise} H ${targetX} V ${top}`,
            (sourceX + targetX) / 2,
            rise,
        ];
    }

    const [path, labelX, labelY] = getSmoothStepPath({
        sourceX: endpoints.value.sourceX,
        sourceY: props.sourceY,
        sourcePosition: props.sourcePosition,
        targetX: endpoints.value.targetX,
        targetY: props.targetY,
        targetPosition: props.targetPosition,
    });

    return [path, labelX, labelY];
});
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
            :marker-start="markerStart"
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
