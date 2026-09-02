<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { Lock } from '@lucide/vue';
import TemplateBlockBuilder from '@/components/domain/configuration/TemplateBlockBuilder.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
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
                fields: TemplateField[];
            }[];
        }[];
    };
    blockTypes: { value: string; label: string }[];
    /** Motivo por el que la plantilla no se edita; nulo cuando sí se puede. */
    processLock: string | null;
}>();

defineOptions({
    layout: { breadcrumbs: [{ title: 'Plantillas', href: templatesIndex() }] },
});
</script>

<template>
    <Head :title="template.name" />

    <PageFrame
        :title="template.name"
        :description="
            template.description ??
            'Plantilla institucional · Organice los bloques de contenido del sílabo.'
        "
        size="wide"
    >
        <template #eyebrow>
            <Button as-child variant="link" class="h-auto px-0">
                <Link :href="templatesIndex()">← Volver a plantillas</Link>
            </Button>
        </template>

        <Alert v-if="processLock">
            <Lock aria-hidden="true" />
            <AlertTitle>Plantilla protegida durante el proceso</AlertTitle>
            <AlertDescription>{{ processLock }}</AlertDescription>
        </Alert>

        <TemplateBlockBuilder
            v-if="!processLock"
            :template-id="template.id"
            :sections="template.sections"
            :block-types="blockTypes"
        />
        <div v-else class="flex flex-col gap-4">
            <Card v-for="section in template.sections" :key="section.id">
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
