<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { Building2 } from '@lucide/vue';
import OfferingRecordSheet from '@/components/domain/academic/OfferingRecordSheet.vue';
import OfferingsTab from '@/components/domain/academic/OfferingsTab.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import { index as offeringsIndex } from '@/routes/coordination/academic/offerings';
import type { AcademicStructureProps } from '@/types/academic';

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Oferta y paralelos', href: offeringsIndex() }],
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
    <Head title="Oferta y paralelos" />

    <PageFrame
        :icon="Building2"
        title="Oferta académica y paralelos"
        :description="`Qué materias se dictan cada periodo en ${career.name}, en qué campus y con qué modalidad.`"
    >
        <template #actions>
            <OfferingRecordSheet :options="options" />
        </template>

        <OfferingsTab :offerings="offerings" :parallels="parallels" />
    </PageFrame>
</template>
