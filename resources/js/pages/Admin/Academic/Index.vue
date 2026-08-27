<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
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
            'Las facultades de la universidad y cuántas carreras tiene cada una.',
        entity: 'faculty',
    },
    careers: {
        title: 'Carreras',
        description: 'Las carreras y a qué facultad pertenece cada una.',
        entity: 'career',
    },
    campuses: {
        title: 'Campus',
        description: 'Las sedes donde se dictan clases.',
        entity: 'campus',
    },
    modalities: {
        title: 'Modalidades',
        description:
            'Las formas de dictar clase: presencial, en línea y las demás que use la universidad.',
        entity: 'modality',
    },
    'academic-periods': {
        title: 'Periodos académicos',
        description:
            'Los periodos lectivos y sus fechas. El ciclo de una materia no va aquí, va en la malla.',
        entity: 'period',
    },
};

const sectionContent = computed(() => sectionContents[props.section]);
</script>

<template>
    <Head :title="sectionContent.title" />

    <PageFrame
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
