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

defineProps<
    Pick<
        AcademicStructureProps,
        'career' | 'curricula' | 'subjects' | 'options'
    >
>();
</script>

<template>
    <Head title="Mallas" />

    <PageFrame
        title="Mallas"
        :description="`Versiones de malla de ${career.name}. Una malla publicada ya no se puede cambiar.`"
    >
        <template #actions>
            <CurriculumRecordSheet entity="curriculum" :options="options" />
        </template>

        <CurriculaTab
            section="curricula"
            :curricula="curricula"
            :subjects="subjects"
            :options="options"
        />
    </PageFrame>
</template>
