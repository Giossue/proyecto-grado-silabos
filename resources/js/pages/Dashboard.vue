<script setup lang="ts">
import { Head, Link, usePage } from '@inertiajs/vue3';
import {
    ArrowRight,
    BookOpenCheck,
    Building2,
    CalendarRange,
    CircleAlert,
    ClipboardCheck,
    FileStack,
    LayoutDashboard,
    ListRestart,
    PencilLine,
    UsersRound,
} from '@lucide/vue';
import type { Component } from 'vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import StatTile from '@/components/domain/StatTile.vue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { dashboard } from '@/routes';
import { index as roleIndex } from '@/routes/role';

type Metric = {
    key: string;
    label: string;
    value: number;
    hint: string;
};

defineProps<{ metrics: Metric[] }>();

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
        :icon="LayoutDashboard"
        title="Panel de trabajo"
        :description="
            activeRole?.career_name ?? 'Gestión institucional de Sílabos UEB'
        "
    >
        <Alert v-if="!activeRole">
            <AlertTitle>Seleccione un rol para continuar</AlertTitle>
            <AlertDescription
                class="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
                <span
                    >Su rol y alcance deben quedar explícitos antes de realizar
                    una acción académica.</span
                >
                <Button as-child size="sm">
                    <Link :href="roleIndex()">
                        Seleccionar rol
                        <ArrowRight aria-hidden="true" />
                    </Link>
                </Button>
            </AlertDescription>
        </Alert>

        <div
            v-else-if="metrics.length > 0"
            class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
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
