<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import InstitutionLogoSheet from '@/components/domain/configuration/InstitutionLogoSheet.vue';
import TemplateSheetEditor from '@/components/domain/configuration/TemplateSheetEditor.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import ProcessLockAlert from '@/components/domain/ProcessLockAlert.vue';
import type { IdentificationCell } from '@/components/domain/syllabus/IdentificationCard.vue';
import type { TableLayout } from '@/lib/tableLayout';
import { index as templatesIndex } from '@/routes/admin/templates';

type TemplateField = {
    id: string;
    block_id: string;
    key: string;
    label: string;
    help: string | null;
    required: boolean;
    inherited: boolean;
    master_source: string | null;
    teacher_editable: boolean;
    ai_enabled: boolean;
    document_marker: string | null;
    content_type: string;
};

defineProps<{
    template: {
        id: string;
        name: string;
        description: string | null;
        sections: {
            id: string;
            key: string;
            title: string;
            description: string | null;
            blocks: {
                id: string;
                key: string;
                title: string;
                content_type: string;
                table: TableLayout | null;
                fields: TemplateField[];
            }[];
        }[];
    };
    blockTypes: { value: string; label: string }[];
    /** Motivo por el que la plantilla no se edita; nulo cuando sí se puede. */
    processLock: string | null;
    /** Ficha de identificación con datos de muestra, ya en cuadrícula. */
    identificationSample: IdentificationCell[][];
    logos: {
        institution: string;
        institution_size: { width: number; height: number };
    };
}>();

defineOptions({
    layout: { breadcrumbs: [{ title: 'Plantilla', href: templatesIndex() }] },
});
</script>

<template>
    <Head title="Plantilla" />

    <PageFrame
        title="Plantilla"
        :description="
            template.description ??
            'El sílabo tal como se imprimirá: arrastre piezas a la hoja y pulse un título para renombrarlo.'
        "
        size="wide"
    >
        <template #actions>
            <InstitutionLogoSheet
                :current-url="logos.institution"
                :size="logos.institution_size"
            />
        </template>

        <ProcessLockAlert
            v-if="processLock"
            title="Plantilla protegida durante el proceso"
            :reason="processLock"
        />

        <TemplateSheetEditor
            :template-id="template.id"
            :sections="template.sections"
            :block-types="blockTypes"
            :identification="identificationSample"
            :institution-logo="logos.institution"
            :readonly="processLock !== null"
        />
    </PageFrame>
</template>
