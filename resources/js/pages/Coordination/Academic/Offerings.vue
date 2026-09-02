<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import OfferingRecordSheet from '@/components/domain/academic/OfferingRecordSheet.vue';
import OfferingsTab from '@/components/domain/academic/OfferingsTab.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import { index as offeringsIndex } from '@/routes/coordination/academic/offerings';
import type { AcademicStructureProps } from '@/types/academic';

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Ofertas', href: offeringsIndex() }],
    },
});

defineProps<
    Pick<
        AcademicStructureProps,
        'career' | 'offerings' | 'parallels' | 'options'
    >
>();
</script>

<template>
    <Head title="Ofertas académicas" />

    <PageFrame
        title="Ofertas académicas"
        :description="`Qué materias se dictan cada periodo en ${career.name}, en qué campus y con qué modalidad.`"
    >
        <template #actions>
            <OfferingRecordSheet entity="oferta" :options="options" />
        </template>

        <OfferingsTab
            section="offerings"
            :offerings="offerings"
            :parallels="parallels"
            :options="options"
        />
    </PageFrame>
</template>
