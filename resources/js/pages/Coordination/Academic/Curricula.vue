<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import CurriculaTab from '@/components/domain/academic/CurriculaTab.vue';
import CurriculumRecordSheet from '@/components/domain/academic/CurriculumRecordSheet.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import { index as curriculaIndex } from '@/routes/coordination/academic/curricula';
import type { AcademicStructureProps } from '@/types/academic';

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Mallas', href: curriculaIndex() }],
    },
});

defineProps<Pick<AcademicStructureProps, 'career' | 'curricula' | 'options'>>();
</script>

<template>
    <Head title="Mallas" />

    <PageFrame
        title="Mallas"
        :description="`Elija una malla de ${career.name} para revisar su desglose académico o abrir el constructor visual.`"
    >
        <template #actions>
            <CurriculumRecordSheet entity="curriculum" :options="options" />
        </template>

        <CurriculaTab :curricula="curricula" :options="options" />
    </PageFrame>
</template>
