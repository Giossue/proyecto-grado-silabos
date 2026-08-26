<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { UsersRound } from '@lucide/vue';
import TeacherAssignmentSheet from '@/components/domain/academic/TeacherAssignmentSheet.vue';
import TeacherAssignmentsPanel from '@/components/domain/academic/TeacherAssignmentsPanel.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import { index as teacherAssignmentsIndex } from '@/routes/coordination/academic/teacher-assignments';
import type { AcademicStructureProps } from '@/types/academic';

defineOptions({
    layout: {
        breadcrumbs: [
            {
                title: 'Asignación docente',
                href: teacherAssignmentsIndex(),
            },
        ],
    },
});

defineProps<
    Pick<AcademicStructureProps, 'career' | 'teacherAssignments' | 'options'>
>();
</script>

<template>
    <Head title="Asignación docente" />

    <PageFrame
        :icon="UsersRound"
        title="Asignación docente"
        :description="`Asigne docentes vigentes a los paralelos de ${career.name} sin mezclar alcances de otras carreras.`"
    >
        <template #actions>
            <TeacherAssignmentSheet :options="options" />
        </template>

        <TeacherAssignmentsPanel :teacher-assignments="teacherAssignments" />
    </PageFrame>
</template>
