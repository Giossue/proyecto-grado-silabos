<script setup lang="ts">
import { Head, usePage } from '@inertiajs/vue3';
import {
    BookOpenCheck,
    Building2,
    CalendarRange,
    CircleAlert,
    ClipboardCheck,
    FileStack,
    ListRestart,
    PencilLine,
    UsersRound,
} from '@lucide/vue';
import type { Component } from 'vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import SetupChecklist from '@/components/domain/SetupChecklist.vue';
import type {Setup} from '@/components/domain/SetupChecklist.vue';
import StatTile from '@/components/domain/StatTile.vue';
import { dashboard } from '@/routes';

type Metric = {
    key: string;
    label: string;
    value: number;
    hint: string;
};

defineProps<{ metrics: Metric[]; setup: Setup | null }>();

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Panel', href: dashboard() }],
    },
});

const page = usePage();
const activeRole = page.props.auth.roles.find(
    (role) => role.id === page.props.auth.active_role_id,
);

// El icono acompaña a la etiqueta; el número no cambia de color según su valor.
const icons: Record<string, Component> = {
    users: UsersRound,
    careers: Building2,
    templates: FileStack,
    failed_jobs: ListRestart,
    open_convocations: CalendarRange,
    in_review: ClipboardCheck,
    correction_requested: CircleAlert,
    approved: BookOpenCheck,
    assigned: BookOpenCheck,
    draft: PencilLine,
};
</script>

<template>
    <Head title="Panel" />

    <PageFrame
        class="h-full flex-1"
        title="Panel de trabajo"
        :description="
            activeRole?.career_name ?? 'Gestión institucional de Sílabos UEB'
        "
    >
        <SetupChecklist v-if="setup" :setup="setup" />

        <!--
            Dos por fila desde el móvil: son cifras cortas y una sola por fila obligaba a
            desplazarse para ver cuatro números. Cuando sobra una, ocupa la fila entera en
            vez de dejar un hueco al lado.
        -->
        <div
            v-if="metrics.length > 0"
            class="grid grid-cols-2 gap-4 xl:grid-cols-4 [&>*:last-child:nth-child(odd)]:col-span-2 xl:[&>*:last-child:nth-child(odd)]:col-span-1"
        >
            <StatTile
                v-for="metric in metrics"
                :key="metric.key"
                :label="metric.label"
                :value="metric.value"
                :hint="metric.hint"
                :icon="icons[metric.key]"
            />
        </div>

        <p v-else class="text-sm text-muted-foreground">
            No hay indicadores disponibles para este rol.
        </p>
    </PageFrame>
</template>
