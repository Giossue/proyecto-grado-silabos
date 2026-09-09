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
                class="flex h-12 min-w-0 items-center justify-between gap-4 px-3 sm:px-5"
            >
                <div class="flex min-w-0 items-baseline gap-2">
                    <span class="truncate text-sm font-semibold">
                        {{ template.name }}
                    </span>
                    <span
                        class="hidden shrink-0 text-xs text-muted-foreground sm:inline"
                    >
                        Modo edición
                    </span>
                </div>

                <Button as-child variant="outline" size="sm">
                    <Link :href="templateShow(template.id)">
                        Volver a la vista
                    </Link>
                </Button>
            </div>

            <div class="min-h-14 min-w-0 border-t" aria-hidden="true" />
        </header>

        <main class="min-w-0 py-5 sm:py-6">
            <TemplateVisualBuilder
                :template="template"
                :appearance="previewAppearance"
                :block-types="blockTypes"
                :variables="variables"
                :identification-design="identificationDesign"
                :color-options="appearanceOptions.colors"
                :readonly="false"
                ribbon
                fixed-ribbon
                @personalize="appearanceOpen = true"
            />
        </main>
    </div>

    <TemplateAppearanceSheet
        v-model:open="appearanceOpen"
        :template-id="template.id"
        :appearance="template.appearance"
        :options="appearanceOptions"
        @preview="previewAppearance = $event"
    />
</template>
