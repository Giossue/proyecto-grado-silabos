<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import TeacherAssignmentSheet from '@/components/domain/academic/TeacherAssignmentSheet.vue';
import TeacherAssignmentsPanel from '@/components/domain/academic/TeacherAssignmentsPanel.vue';
import TeacherReliefSheet from '@/components/domain/academic/TeacherReliefSheet.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import ProcessLockAlert from '@/components/domain/ProcessLockAlert.vue';
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
        title="Asignación docente"
        :description="`Quién dicta cada paralelo en ${career.name}.`"
    >
        <template #actions>
            <TeacherReliefSheet
                v-if="!career.lock_reason"
                :teacher-assignments="teacherAssignments"
                :options="options"
            />
            <TeacherAssignmentSheet
                v-if="!career.lock_reason"
                :options="options"
            />
        </template>

        <ProcessLockAlert
            v-if="career.lock_reason"
            title="Asignaciones docentes bloqueadas"
            :reason="career.lock_reason"
        />

        <TeacherAssignmentsPanel
            :teacher-assignments="teacherAssignments"
            :options="options"
            :lock-reason="career.lock_reason"
        />
    </PageFrame>
</template>
