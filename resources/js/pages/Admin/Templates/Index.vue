<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import { Inbox } from '@lucide/vue';
import TemplateCreationSheet from '@/components/domain/configuration/TemplateCreationSheet.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@/components/ui/empty';
import { index as templatesIndex } from '@/routes/admin/templates';

/*
 * Solo se ve cuando todavía no existe la plantilla institucional: con ella creada, la
 * ruta abre directamente su constructor (I-32).
 */
defineProps<{
    /** Motivo por el que la plantilla no se edita; nulo cuando sí se puede. */
    processLock: string | null;
}>();

defineOptions({
    layout: { breadcrumbs: [{ title: 'Plantilla', href: templatesIndex() }] },
});
</script>

<template>
    <Head title="Plantilla" />
    <PageFrame
        title="Plantilla de sílabo"
        description="El formato del sílabo: qué campos tiene y en qué orden. Se edita en el sitio; cada sílabo entregado conserva su propia copia."
    >
        <template #actions>
            <TemplateCreationSheet v-if="!processLock" />
        </template>

        <Empty class="min-h-72 border">
            <EmptyHeader>
                <EmptyMedia variant="icon" class="text-muted-foreground">
                    <Inbox aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No hay una plantilla institucional</EmptyTitle>
                <EmptyDescription>
                    Cree la plantilla con las doce áreas base y organice después
                    sus bloques y campos. Sin ella no se puede abrir el proceso
                    de sílabos.
                </EmptyDescription>
            </EmptyHeader>
        </Empty>
    </PageFrame>
</template>
