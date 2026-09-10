<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { ref, watch } from 'vue';
import TemplateAppearanceSheet from '@/components/domain/configuration/TemplateAppearanceSheet.vue';
import TemplateVisualBuilder from '@/components/domain/configuration/TemplateVisualBuilder.vue';
import { Button } from '@/components/ui/button';
import { show as templateShow } from '@/routes/admin/templates';
import type {
    TemplateAppearance,
    TemplateBuilderProps,
} from '@/types/configuration';

const props = defineProps<TemplateBuilderProps>();

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
    <Head title="Editar plantilla" />

    <div class="min-h-dvh min-w-0">
        <header
            class="sticky top-0 z-30 border-b bg-background/95 shadow-sm backdrop-blur"
            aria-label="Herramientas del editor de plantilla"
        >
            <div
                class="grid h-12 min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 sm:px-5"
            >
                <Button
                    as-child
                    variant="outline"
                    size="sm"
                    class="justify-self-start"
                >
                    <Link :href="templateShow(template.id)">
                        Volver a la vista
                    </Link>
                </Button>

                <div
                    id="template-editor-header-selection"
                    class="min-w-0 justify-self-center"
                />

                <div aria-hidden="true" />
            </div>

            <div class="min-h-14 min-w-0 border-t" aria-hidden="true" />
        </header>

        <main class="min-w-0 py-5 sm:py-6">
            <TemplateVisualBuilder
                :template="template"
                :appearance="previewAppearance"
                :block-types="blockTypes"
                :variables="variables"
                :logos="logos"
                :identification-design="identificationDesign"
                :color-options="appearanceOptions.colors"
                :readonly="false"
                ribbon
                fixed-ribbon
                selection-target="#template-editor-header-selection"
                @personalize="appearanceOpen = true"
            />
        </main>
    </div>

    <TemplateAppearanceSheet
        v-model:open="appearanceOpen"
        :template-id="template.id"
        :appearance="template.appearance"
        :options="appearanceOptions"
        :institution-logo-url="logos.institution"
        @preview="previewAppearance = $event"
    />
</template>
