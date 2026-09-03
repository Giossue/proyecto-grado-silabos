<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import TemplateBlockBuilder from '@/components/domain/configuration/TemplateBlockBuilder.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import ProcessLockAlert from '@/components/domain/ProcessLockAlert.vue';
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

const props = defineProps<{
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

const typeLabel = (value: string): string =>
    props.blockTypes.find((type) => type.value === value)?.label ?? value;

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
            'El formato del sílabo: organice las secciones, los bloques y los campos que llenan los docentes.'
        "
        size="wide"
    >
        <ProcessLockAlert
            v-if="processLock"
            title="Plantilla protegida durante el proceso"
            :reason="processLock"
        />

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
                    <p class="text-base font-semibold">Campos</p>
                    <ul
                        v-if="section.blocks.length > 0"
                        class="flex flex-col gap-3"
                    >
                        <li
                            v-for="block in section.blocks"
                            :key="block.id"
                            class="rounded-lg border bg-muted/20 p-4"
                        >
                            <dl class="grid gap-3 sm:grid-cols-2">
                                <div>
                                    <dt class="text-sm text-muted-foreground">
                                        Nombre del campo
                                    </dt>
                                    <dd>
                                        {{
                                            block.fields[0]?.label ??
                                            block.title
                                        }}
                                    </dd>
                                </div>
                                <div>
                                    <dt class="text-sm text-muted-foreground">
                                        Tipo de contenido
                                    </dt>
                                    <dd>{{ typeLabel(block.content_type) }}</dd>
                                </div>
                                <div
                                    v-if="block.fields[0]?.help"
                                    class="sm:col-span-2"
                                >
                                    <dt class="text-sm text-muted-foreground">
                                        Ayuda para el docente
                                    </dt>
                                    <dd>{{ block.fields[0]?.help }}</dd>
                                </div>
                            </dl>
                        </li>
                    </ul>
                    <p v-else class="text-sm text-muted-foreground">
                        Este bloque no tiene campos.
                    </p>
                </CardContent>
            </Card>
        </div>
    </PageFrame>
</template>
