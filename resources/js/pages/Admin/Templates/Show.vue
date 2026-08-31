<script setup lang="ts">
import { Form, Head, Link } from '@inertiajs/vue3';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import TemplateBlockBuilder from '@/components/domain/configuration/TemplateBlockBuilder.vue';
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
    required: boolean;
    inherited: boolean;
    master_source: string | null;
    teacher_editable: boolean;
    ai_enabled: boolean;
    document_marker: string | null;
    content_type: string;
};

defineProps<{
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
                content_type: string;
                fields: TemplateField[];
            }[];
        }[];
    };
    blockTypes: { value: string; label: string }[];
}>();

defineOptions({
    layout: { breadcrumbs: [{ title: 'Plantillas', href: templatesIndex() }] },
});
</script>

<template>
    <Head
        :title="templateVersion.template.name + ' v' + templateVersion.number"
    />

    <PageFrame
        :title="`${templateVersion.template.name} · v${templateVersion.number}`"
        :description="`${templateVersion.template.career_name ?? 'Alcance general'} · Organice los bloques de contenido de esta versión.`"
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
            <Form
                v-if="templateVersion.state === 'draft'"
                v-bind="TemplateController.publish.form(templateVersion.id)"
                v-slot="{ errors, processing }"
            >
                <FieldError :errors="[errors.version]" />
                <Button type="submit" :disabled="processing">
                    <Spinner v-if="processing" />
                    Publicar
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

        <TemplateBlockBuilder
            v-if="templateVersion.state === 'draft'"
            :template-version-id="templateVersion.id"
            :sections="templateVersion.sections"
            :block-types="blockTypes"
        />
        <div v-else class="flex flex-col gap-4">
            <Card v-for="section in templateVersion.sections" :key="section.id">
                <CardHeader>
                    <CardTitle>{{ section.title }}</CardTitle>
                    <CardDescription v-if="section.description">
                        {{ section.description }}
                    </CardDescription>
                </CardHeader>
                <CardContent class="flex flex-col gap-3">
                    <div
                        v-for="block in section.blocks"
                        :key="block.id"
                        class="rounded-lg border p-4"
                    >
                        <h3 class="font-medium">{{ block.title }}</h3>
                    </div>
                </CardContent>
            </Card>
        </div>
    </PageFrame>
</template>
