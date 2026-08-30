<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import CurriculaTab from '@/components/domain/academic/CurriculaTab.vue';
import CurriculumRecordSheet from '@/components/domain/academic/CurriculumRecordSheet.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import { index as subjectsIndex } from '@/routes/coordination/academic/subjects';
import type { AcademicStructureProps } from '@/types/academic';

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Materias', href: subjectsIndex() }],
    },
});

defineProps<
    Pick<
        AcademicStructureProps,
        'career' | 'curricula' | 'subjects' | 'options'
    >
>();
</script>

<template>
    <Head title="Materias" />

    <PageFrame
        title="Materias"
        :description="`Materias organizadas por las mallas de ${career.name}.`"
    >
        <template #actions>
            <CurriculumRecordSheet entity="subject" :options="options" />
        </template>

        <CurriculaTab
            section="subjects"
            :curricula="curricula"
            :subjects="subjects"
        />
    </PageFrame>
</template>
