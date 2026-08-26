<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { BookOpenCheck } from '@lucide/vue';
import CurriculaTab from '@/components/domain/academic/CurriculaTab.vue';
import CurriculumRecordSheet from '@/components/domain/academic/CurriculumRecordSheet.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import { index as curriculaIndex } from '@/routes/coordination/academic/curricula';
import type { AcademicStructureProps } from '@/types/academic';

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Mallas y materias', href: curriculaIndex() }],
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
    <Head title="Mallas y materias" />

    <PageFrame
        :icon="BookOpenCheck"
        title="Mallas y materias"
        :description="`Gestione ciclos y materias únicamente para la carrera ${career.name}. Publicar una malla vuelve inmutable su contenido.`"
    >
        <template #actions>
            <CurriculumRecordSheet :options="options" />
        </template>

        <CurriculaTab :curricula="curricula" :subjects="subjects" />
    </PageFrame>
</template>
