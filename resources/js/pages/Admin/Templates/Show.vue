<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { ref, watch } from 'vue';
import TemplateAppearanceSheet from '@/components/domain/configuration/TemplateAppearanceSheet.vue';
import TemplateVisualBuilder from '@/components/domain/configuration/TemplateVisualBuilder.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import ProcessLockAlert from '@/components/domain/ProcessLockAlert.vue';
import { Button } from '@/components/ui/button';
import { index as templatesIndex } from '@/routes/admin/templates';
import type {
    TemplateAppearance,
    TemplateBuilderProps,
} from '@/types/configuration';

const props = defineProps<TemplateBuilderProps>();

defineOptions({
    layout: { breadcrumbs: [{ title: 'Plantilla', href: templatesIndex() }] },
});

const appearanceOpen = ref(false);
const previewAppearance = ref<TemplateAppearance>({
    ...props.template.appearance,
});

watch(
    () => props.template.appearance,
    (appearance) => {
        previewAppearance.value = { ...appearance };
    },
    { deep: true },
);
</script>

<template>
    <Head title="Plantilla" />
    <PageFrame
        title="Plantilla de sílabo"
        description="Hoja base de la plantilla institucional."
        size="wide"
    >
        <template #actions>
            <Button
                v-if="!processLock"
                type="button"
                variant="outline"
                @click="appearanceOpen = true"
            >
                Personalizar
            </Button>
        </template>

        <ProcessLockAlert
            v-if="processLock"
            title="Plantilla protegida durante el proceso"
            :reason="processLock"
        />

        <TemplateVisualBuilder
            :template="template"
            :appearance="previewAppearance"
            :block-types="blockTypes"
            :variables="variables"
            :identification-design="identificationDesign"
            :readonly="Boolean(processLock)"
        />
    </PageFrame>

    <TemplateAppearanceSheet
        v-model:open="appearanceOpen"
        :template-id="template.id"
        :appearance="template.appearance"
        :options="appearanceOptions"
        @preview="previewAppearance = $event"
    />
</template>
