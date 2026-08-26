<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { ClipboardCheck } from '@lucide/vue';
import CoordinatorAssignmentSheet from '@/components/domain/academic/CoordinatorAssignmentSheet.vue';
import CoordinatorAssignmentsPanel from '@/components/domain/academic/CoordinatorAssignmentsPanel.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import { index as coordinationsIndex } from '@/routes/admin/coordinations';
import type { AcademicStructureProps } from '@/types/academic';

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Coordinaciones', href: coordinationsIndex() }],
    },
});

defineProps<
    Pick<AcademicStructureProps, 'coordinatorAssignments' | 'options'>
>();
</script>

<template>
    <Head title="Coordinaciones" />

    <PageFrame
        :icon="ClipboardCheck"
        title="Coordinaciones de carrera"
        description="Vincule cuentas con rol Coordinador a una carrera y defina su vigencia sin duplicar personas."
    >
        <template #actions>
            <CoordinatorAssignmentSheet :options="options" />
        </template>

        <CoordinatorAssignmentsPanel
            :coordinator-assignments="coordinatorAssignments"
        />
    </PageFrame>
</template>
