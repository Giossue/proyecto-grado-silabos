<script setup lang="ts">
import { Form, Head, Link } from '@inertiajs/vue3';
import { computed, ref } from 'vue';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import TemplateFieldSheet from '@/components/domain/configuration/TemplateFieldSheet.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { FieldError } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { index as templatesIndex } from '@/routes/admin/templates';

type TemplateField = {
    id: string;
    block_id: string;
    key: string;
    label: string;
    help: string | null;
    type: string;
    required: boolean;
    inherited: boolean;
    master_source: string | null;
    teacher_editable: boolean;
    ai_enabled: boolean;
    document_marker: string | null;
};

type TemplateFieldSheetHandle = {
    edit: (field: TemplateField) => void;
};

const props = defineProps<{
    templateVersion: {
        id: string;
        number: number;
        state: string;
        template: {
            name: string;
            description: string | null;
            career_name: string | null;
        };
        sections: {
            id: string;
            key: string;
            title: string;
            description: string | null;
            blocks: {
                id: string;
                key: string;
                title: string;
                type: string;
                fields: TemplateField[];
            }[];
        }[];
    };
    fieldTypes: { value: string; label: string }[];
}>();

defineOptions({
    layout: { breadcrumbs: [{ title: 'Plantillas', href: templatesIndex() }] },
});

const fieldSheet = ref<TemplateFieldSheetHandle | null>(null);
const blockOptions = computed(() =>
    props.templateVersion.sections.flatMap((section) =>
        section.blocks.map((block) => ({
            id: block.id,
            label: section.title + ' · ' + block.title,
        })),
    ),
);
</script>

<template>
    <Head
        :title="templateVersion.template.name + ' v' + templateVersion.number"
    />

    <PageFrame
        :title="`${templateVersion.template.name} · v${templateVersion.number}`"
        :description="`${templateVersion.template.career_name ?? 'Alcance general'} · Añada los campos de esta versión y ordénelos.`"
    >
        <template #eyebrow>
            <Button as-child variant="link" class="h-auto px-0">
                <Link :href="templatesIndex()">← Volver a plantillas</Link>
            </Button>
        </template>
        <template #meta>
            <Badge
                :variant="
                    templateVersion.state === 'published'
                        ? 'secondary'
                        : 'outline'
                "
            >
                {{
                    templateVersion.state === 'published'
                        ? 'Publicada'
                        : 'Borrador'
                }}
            </Badge>
        </template>
        <template #actions>
            <TemplateFieldSheet
                v-if="templateVersion.state === 'draft'"
                ref="fieldSheet"
                :template-version-id="templateVersion.id"
                :block-options="blockOptions"
                :field-types="fieldTypes"
            />
            <Form
                v-if="templateVersion.state === 'draft'"
                v-bind="TemplateController.publish.form(templateVersion.id)"
                v-slot="{ errors, processing }"
            >
                <FieldError :errors="[errors.version]" />
                <Button type="submit" :disabled="processing">
                    <Spinner v-if="processing" />
                    Publicar versión
                </Button>
            </Form>
            <Form
                v-else
                v-bind="TemplateController.clone.form(templateVersion.id)"
                v-slot="{ processing }"
            >
                <Button type="submit" variant="outline" :disabled="processing">
                    <Spinner v-if="processing" />
                    Crear nueva versión
                </Button>
            </Form>
        </template>

        <div class="flex flex-col gap-4">
            <Card v-for="section in templateVersion.sections" :key="section.id">
                <CardHeader>
                    <CardTitle>{{ section.title }}</CardTitle>
                    <CardDescription v-if="section.description">
                        {{ section.description }}
                    </CardDescription>
                </CardHeader>
                <CardContent class="flex flex-col gap-4">
                    <div
                        v-for="block in section.blocks"
                        :key="block.id"
                        class="rounded-lg border p-4"
                    >
                        <div
                            class="mb-3 flex items-center justify-between gap-3"
                        >
                            <h3 class="font-medium">{{ block.title }}</h3>
                        </div>
                        <div class="grid gap-3 sm:grid-cols-2">
                            <button
                                v-for="field in block.fields"
                                :key="field.id"
                                type="button"
                                class="rounded-md border bg-muted/20 p-3 text-left transition-colors hover:bg-muted/50 disabled:cursor-default"
                                :disabled="
                                    templateVersion.state === 'published'
                                "
                                @click="fieldSheet?.edit(field)"
                            >
                                <div class="flex flex-wrap items-center gap-2">
                                    <span class="font-medium">
                                        {{ field.label }}
                                    </span>
                                    <Badge
                                        v-if="field.required"
                                        variant="secondary"
                                    >
                                        Obligatorio
                                    </Badge>
                                    <Badge
                                        v-if="field.inherited"
                                        variant="outline"
                                    >
                                        Dato institucional
                                    </Badge>
                                    <Badge
                                        v-if="field.ai_enabled"
                                        variant="outline"
                                    >
                                        Asistencia de IA
                                    </Badge>
                                </div>
                                <p
                                    v-if="field.help"
                                    class="mt-1 text-sm text-muted-foreground"
                                >
                                    {{ field.help }}
                                </p>
                            </button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    </PageFrame>
</template>
