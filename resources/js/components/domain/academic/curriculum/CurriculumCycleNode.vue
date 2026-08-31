<script setup lang="ts">
defineProps<{
    data: {
        cycle: number;
        subjectCount: number;
        totalHours: number;
    };
}>();
</script>

<template>
    <section
        class="size-full overflow-hidden rounded-md border bg-card"
        :aria-label="`Ciclo ${data.cycle}`"
    >
        <div class="flex h-full">
            <header
                class="flex w-28 shrink-0 flex-col items-center justify-center gap-2 border-r bg-primary/10 p-3 text-center"
            >
                <strong class="text-sm">Ciclo {{ data.cycle }}</strong>
                <span class="text-xs text-muted-foreground">
                    {{ data.subjectCount }} materias
                </span>
                <span class="text-xs font-medium">{{ data.totalHours }} h</span>
            </header>
        </div>
    </section>
</template>
