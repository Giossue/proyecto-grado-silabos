<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import OfferingsTab from '@/components/domain/academic/OfferingsTab.vue';
import PeriodPreparationSheet from '@/components/domain/academic/PeriodPreparationSheet.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import ProcessLockAlert from '@/components/domain/ProcessLockAlert.vue';
import { index as offeringsIndex } from '@/routes/coordination/academic/offerings';
import type { AcademicStructureProps } from '@/types/academic';

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Ofertas', href: offeringsIndex() }],
    },
});

defineProps<
    Pick<AcademicStructureProps, 'career' | 'offerings' | 'options'>
>();
</script>

<template>
    <Head title="Ofertas académicas" />

    <PageFrame
        title="Ofertas académicas"
        :description="`Qué materias se dictan cada periodo en ${career.name}, en qué campus y con qué modalidad.`"
    >
        <template #actions>
            <PeriodPreparationSheet
                v-if="!career.lock_reason"
                :offerings="offerings"
                :options="options"
            />
        </template>

        <ProcessLockAlert
            v-if="career.lock_reason"
            title="Ofertas académicas bloqueadas"
            :reason="career.lock_reason"
        />

        <OfferingsTab
            :offerings="offerings"
            :options="options"
            :lock-reason="career.lock_reason"
        />
    </PageFrame>
</template>
