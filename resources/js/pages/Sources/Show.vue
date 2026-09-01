<script setup lang="ts">
import { Head, Link, useForm } from '@inertiajs/vue3';
import { Check } from '@lucide/vue';
import AcademicSourceEditSheet from '@/components/domain/configuration/AcademicSourceEditSheet.vue';
import MarkdownEditor from '@/components/domain/MarkdownEditor.vue';
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
import { index as sourcesIndex } from '@/routes/sources';
import { update as sourceContentUpdate } from '@/routes/sources/content';

const props = defineProps<{
    source: {
        id: string;
        name: string;
        description: string | null;
        internal_notes: string | null;
        content: string | null;
        updated_at: string | null;
    };
}>();

const form = useForm({ content: props.source.content ?? '' });

const save = (): void => {
    form.put(sourceContentUpdate.url(props.source.id), {
        preserveScroll: true,
        onSuccess: () => form.defaults(),
    });
};

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Fuentes académicas', href: sourcesIndex() }],
    },
});
</script>

<template>
    <Head :title="source.name" />

    <PageFrame
        :title="source.name"
        :description="
            source.description ??
            'Documento de apoyo para los sílabos de la carrera.'
        "
    >
        <template #eyebrow>
            <Button as-child variant="link" class="h-auto px-0">
                <Link :href="sourcesIndex()">← Volver a fuentes</Link>
            </Button>
        </template>
        <template #meta>
            <Badge v-if="source.updated_at" variant="outline">
                Actualizada el {{ source.updated_at }}
            </Badge>
        </template>
        <template #actions>
            <AcademicSourceEditSheet :source="source" />
        </template>

        <div class="flex flex-col gap-4">
            <Card v-if="source.internal_notes">
                <CardHeader>
                    <CardTitle>Notas internas</CardTitle>
                    <CardDescription>
                        Solo las ve la coordinación; no forman parte del
                        documento.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p class="text-sm whitespace-pre-wrap">
                        {{ source.internal_notes }}
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Contenido del documento</CardTitle>
                    <CardDescription>
                        Redáctelo con la cinta de opciones, como en un
                        procesador de textos. La vista previa muestra el
                        resultado final.
                    </CardDescription>
                </CardHeader>
                <CardContent class="flex flex-col gap-3">
                    <MarkdownEditor
                        v-model="form.content"
                        label="Contenido del documento en Markdown"
                    />
                    <FieldError :errors="[form.errors.content]" />
                    <div class="flex items-center justify-end gap-3">
                        <span
                            v-if="form.isDirty"
                            class="text-sm text-muted-foreground"
                        >
                            Cambios sin guardar
                        </span>
                        <Button
                            type="button"
                            :disabled="form.processing || !form.isDirty"
                            @click="save"
                        >
                            <Spinner v-if="form.processing" />
                            <Check
                                v-else
                                data-icon="inline-start"
                                aria-hidden="true"
                            />
                            Guardar contenido
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    </PageFrame>
</template>
