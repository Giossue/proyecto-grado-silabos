<script setup lang="ts">
import { formatNumericDisplay } from '@/lib/numberDisplay';

defineProps<{
    data: {
        cycle: number;
        level: string;
        unit: string | null;
        unitStyle: { backgroundColor: string; color: string };
        subjectCount: number;
        totalHours: number;
    };
}>();
</script>

<template>
    <section
        class="size-full cursor-default overflow-hidden rounded-md border bg-card"
        :aria-label="`Nivel ${data.level}`"
    >
        <div class="flex h-full">
            <!--
                Franja de unidad de organización curricular al estilo de la malla
                institucional: los niveles contiguos de la misma unidad comparten
                color y se leen como un solo bloque.
            -->
            <div
                class="flex w-9 shrink-0 items-center justify-center border-r"
                :style="data.unitStyle"
            >
                <span
                    class="-rotate-90 text-[0.6rem] font-semibold tracking-wide whitespace-nowrap uppercase"
                >
                    {{ data.unit ?? '' }}
                </span>
            </div>
            <header
                class="flex w-20 shrink-0 flex-col items-center justify-center gap-1 border-r bg-primary/10 p-3 text-center"
            >
                <span class="text-xs text-muted-foreground uppercase">
                    Nivel
                </span>
                <strong class="text-lg">{{ data.level }}</strong>
            </header>
            <div class="flex-1"></div>
            <div
                class="flex w-20 shrink-0 flex-col items-center justify-center gap-1 border-l bg-primary/10 p-3 text-center"
            >
                <span class="text-xs text-muted-foreground">Asignaturas</span>
                <strong class="text-sm">{{ data.subjectCount }}</strong>
            </div>
            <div
                class="flex w-20 shrink-0 flex-col items-center justify-center gap-1 border-l bg-primary/10 p-3 text-center"
            >
                <span class="text-xs text-muted-foreground">Total</span>
                <strong class="text-sm">
                    {{ formatNumericDisplay(data.totalHours) }}
                </strong>
            </div>
        </div>
    </section>
</template>
