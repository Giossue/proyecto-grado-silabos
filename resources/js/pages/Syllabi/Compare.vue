<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { ArrowLeft } from '@lucide/vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';

type ChangeSide = {
    value: unknown;
    rows: unknown[];
} | null;

type Change = {
    section_key: string;
    section_title: string;
    field_key: string;
    label: string;
    type: string;
    change: 'added' | 'removed' | 'modified';
    before: ChangeSide;
    after: ChangeSide;
};

defineProps<{
    syllabus: {
        id: string;
        subject: string;
        code: string;
        period: string;
    };
    comparison: {
        before_revision: number;
        after_revision: number;
        changed_fields: number;
        changes: Change[];
    };
}>();

const formatSide = (side: ChangeSide): string => {
    if (side === null) {
        return 'No existía en esta revisión.';
    }

    if (side.rows.length > 0) {
        return JSON.stringify(side.rows, null, 2);
    }

    if (side.value === null || side.value === '') {
        return 'Sin contenido';
    }

    if (typeof side.value === 'boolean') {
        return side.value ? 'Sí' : 'No';
    }

    if (typeof side.value === 'object') {
        return JSON.stringify(side.value, null, 2);
    }

    return String(side.value);
};

const changeLabel = (change: Change['change']): string =>
    ({ added: 'Agregado', removed: 'Retirado', modified: 'Modificado' })[
        change
    ];

const goBack = (): void => window.history.back();
</script>

<template>
    <Head :title="`Comparar revisiones · ${syllabus.subject}`" />
    <PageFrame
        title="Comparar revisiones"
        :description="`${syllabus.subject} · ${syllabus.code} · ${syllabus.period}`"
    >
        <template #eyebrow>
            <Button variant="link" class="h-auto px-0" @click="goBack">
                <ArrowLeft aria-hidden="true" />
                Volver al expediente
            </Button>
        </template>
        <template #meta>
            <Badge variant="secondary">
                {{ comparison.changed_fields }} campo(s) con cambios
            </Badge>
        </template>

        <Card>
            <CardHeader>
                <CardTitle>
                    Revisión {{ comparison.before_revision }} → revisión
                    {{ comparison.after_revision }}
                </CardTitle>
                <CardDescription>
                    La comparación usa snapshots inmutables del mismo
                    expediente; las filas se conservan por su identidad estable.
                </CardDescription>
            </CardHeader>
        </Card>

        <Card
            v-for="change in comparison.changes"
            :key="`${change.section_key}.${change.field_key}`"
        >
            <CardHeader>
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <CardDescription>{{
                            change.section_title
                        }}</CardDescription>
                        <CardTitle>{{ change.label }}</CardTitle>
                    </div>
                    <Badge variant="outline">
                        {{ changeLabel(change.change) }}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent class="grid gap-4 lg:grid-cols-2">
                <section
                    class="min-w-0 rounded-md border border-red-200 p-4 dark:border-red-900"
                >
                    <h2 class="font-medium">
                        Revisión {{ comparison.before_revision }}
                    </h2>
                    <pre
                        class="mt-3 overflow-x-auto font-sans text-sm whitespace-pre-wrap"
                        >{{ formatSide(change.before) }}</pre>
                </section>
                <section
                    class="min-w-0 rounded-md border border-emerald-200 p-4 dark:border-emerald-900"
                >
                    <h2 class="font-medium">
                        Revisión {{ comparison.after_revision }}
                    </h2>
                    <pre
                        class="mt-3 overflow-x-auto font-sans text-sm whitespace-pre-wrap"
                        >{{ formatSide(change.after) }}</pre>
                </section>
            </CardContent>
        </Card>

        <Card v-if="comparison.changes.length === 0">
            <CardContent class="py-10 text-center text-muted-foreground">
                No hay diferencias de contenido entre estas revisiones.
            </CardContent>
        </Card>
    </PageFrame>
</template>
