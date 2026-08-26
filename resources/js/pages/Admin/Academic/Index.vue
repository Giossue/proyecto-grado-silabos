<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { Building2 } from '@lucide/vue';
import { computed } from 'vue';
import CatalogRecordSheet from '@/components/domain/academic/CatalogRecordSheet.vue';
import CatalogSection from '@/components/domain/academic/CatalogSection.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import { index as academicIndex } from '@/routes/admin/academic';
import type {
    AcademicStructureProps,
    GovernanceCatalogEntity,
    GovernanceSection,
} from '@/types/academic';

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Estructura académica', href: academicIndex() }],
    },
});

const props = defineProps<
    Pick<AcademicStructureProps, 'catalogs' | 'options'> & {
        section: GovernanceSection;
    }
>();

const sectionContents: Record<
    GovernanceSection,
    {
        title: string;
        description: string;
        entity: GovernanceCatalogEntity;
    }
> = {
    faculties: {
        title: 'Facultades',
        description:
            'Administre las unidades académicas y consulte cuántas carreras dependen de cada una.',
        entity: 'faculty',
    },
    careers: {
        title: 'Carreras',
        description:
            'Administre las carreras y su pertenencia obligatoria a una facultad.',
        entity: 'career',
    },
    campuses: {
        title: 'Campus',
        description:
            'Administre las sedes institucionales sin mezclarlas con facultades o carreras.',
        entity: 'campus',
    },
    modalities: {
        title: 'Modalidades',
        description:
            'Administre las formas de impartición disponibles en la oferta académica.',
        entity: 'modality',
    },
    'academic-periods': {
        title: 'Periodos académicos',
        description:
            'Administre ventanas temporales institucionales; el ciclo pertenece a la malla.',
        entity: 'period',
    },
};

const sectionContent = computed(() => sectionContents[props.section]);
</script>

<template>
    <Head :title="sectionContent.title" />

    <PageFrame
        :icon="Building2"
        :title="sectionContent.title"
        :description="sectionContent.description"
    >
        <template #actions>
            <CatalogRecordSheet
                :entity="sectionContent.entity"
                :options="options"
            />
        </template>

        <CatalogSection :section="section" :catalogs="catalogs" />
    </PageFrame>
</template>
