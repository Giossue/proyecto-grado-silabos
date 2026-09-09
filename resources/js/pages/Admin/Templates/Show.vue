<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { Pencil } from '@lucide/vue';
import TemplateVisualBuilder from '@/components/domain/configuration/TemplateVisualBuilder.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import ProcessLockAlert from '@/components/domain/ProcessLockAlert.vue';
import { Button } from '@/components/ui/button';
import {
    edit as templateEdit,
    index as templatesIndex,
} from '@/routes/admin/templates';
import type { TemplateBuilderProps } from '@/types/configuration';

defineProps<TemplateBuilderProps>();

defineOptions({
    layout: { breadcrumbs: [{ title: 'Plantilla', href: templatesIndex() }] },
});
</script>

<template>
    <Head title="Plantilla" />
    <PageFrame
        title="Plantilla de sílabo"
        description="Hoja base de la plantilla institucional."
        size="wide"
    >
        <template #actions>
            <Button v-if="!processLock" as-child>
                <Link :href="templateEdit(template.id)">
                    <Pencil data-icon="inline-start" aria-hidden="true" />
                    Editar
                </Link>
            </Button>
        </template>

        <ProcessLockAlert
            v-if="processLock"
            title="Plantilla protegida durante el proceso"
            :reason="processLock"
        />

        <TemplateVisualBuilder
            :template="template"
            :appearance="template.appearance"
            :block-types="blockTypes"
            :variables="variables"
            :identification-design="identificationDesign"
            :color-options="appearanceOptions.colors"
            :readonly="true"
        />
    </PageFrame>
</template>
