<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { Inbox } from '@lucide/vue';
import CurriculumRecordSheet from '@/components/domain/academic/CurriculumRecordSheet.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@/components/ui/empty';
import { index as curriculaIndex } from '@/routes/coordination/academic/curricula';
import type { AcademicStructureProps } from '@/types/academic';

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Malla', href: curriculaIndex() }],
    },
});

defineProps<Pick<AcademicStructureProps, 'career' | 'options'>>();
</script>

<template>
    <Head title="Malla" />

    <PageFrame
        title="Malla"
        :description="`Configure la estructura académica de ${career.name}. Sin una malla activa no se habilitarán procesos nuevos para docentes.`"
    >
        <template #actions>
            <CurriculumRecordSheet entity="malla" :options="options" />
        </template>

        <Empty class="min-h-72 border">
            <EmptyHeader>
                <EmptyMedia variant="icon" class="text-muted-foreground">
                    <Inbox aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No hay una malla configurada</EmptyTitle>
                <EmptyDescription>
                    Cree la malla de esta carrera para agregar materias, campos
                    y relaciones académicas.
                </EmptyDescription>
            </EmptyHeader>
        </Empty>
    </PageFrame>
</template>
