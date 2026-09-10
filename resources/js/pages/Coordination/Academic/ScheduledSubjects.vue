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
    Pick<
        AcademicStructureProps,
        'career' | 'scheduledSubjects' | 'options' | 'selectedPeriodId'
    >
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
                v-if="
                    !career.lock_reason &&
                    options.periods.some((period) => period.planning_enabled)
                "
                :scheduledSubjects="scheduledSubjects"
                :options="options"
                :initial-period-id="selectedPeriodId"
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
            :selected-period-id="selectedPeriodId"
            :lock-reason="career.lock_reason"
        />
    </PageFrame>
</template>
