<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import PeriodPreparationSheet from '@/components/domain/academic/PeriodPreparationSheet.vue';
import ScheduledSubjectsTab from '@/components/domain/academic/ScheduledSubjectsTab.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import ProcessLockAlert from '@/components/domain/ProcessLockAlert.vue';
import { index as scheduledSubjectsIndex } from '@/routes/coordination/academic/scheduled-subjects';
import type { AcademicStructureProps } from '@/types/academic';

defineOptions({
    layout: {
        breadcrumbs: [
            { title: 'Materias y paralelos', href: scheduledSubjectsIndex() },
        ],
    },
});

defineProps<
    Pick<AcademicStructureProps, 'career' | 'scheduledSubjects' | 'options'>
>();
</script>

<template>
    <Head title="Materias y paralelos" />

    <PageFrame
        title="Materias y paralelos"
        :description="`Planifique qué materias se dictan cada período en ${career.name} y organice sus paralelos.`"
    >
        <template #actions>
            <PeriodPreparationSheet
                v-if="!career.lock_reason"
                :scheduledSubjects="scheduledSubjects"
                :options="options"
            />
        </template>

        <ProcessLockAlert
            v-if="career.lock_reason"
            title="Planificación académica bloqueada"
            :reason="career.lock_reason"
        />

        <ScheduledSubjectsTab
            :scheduledSubjects="scheduledSubjects"
            :options="options"
            :lock-reason="career.lock_reason"
        />
    </PageFrame>
</template>
