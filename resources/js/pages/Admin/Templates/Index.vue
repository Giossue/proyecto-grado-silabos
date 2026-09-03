<script setup lang="ts">
import { Head, router } from '@inertiajs/vue3';
import { Inbox, LoaderCircle, Plus } from '@lucide/vue';
import { ref } from 'vue';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import PageFrame from '@/components/domain/PageFrame.vue';
import { Button } from '@/components/ui/button';
import {
    Empty,
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

const creating = ref(false);

const createTemplate = (): void => {
    if (creating.value) {
        return;
    }

    creating.value = true;
    router.post(
        TemplateController.store.url(),
        {},
        {
            onFinish: () => {
                creating.value = false;
            },
        },
    );
};
</script>

<template>
    <Head title="Plantilla" />
    <PageFrame
        title="Plantilla de sílabo"
        description="El formato del sílabo: qué campos tiene y en qué orden. Se edita en el sitio; cada sílabo entregado conserva su propia copia."
    >
        <template #actions>
            <Button
                v-if="!processLock"
                :disabled="creating"
                @click="createTemplate"
            >
                <LoaderCircle
                    v-if="creating"
                    class="animate-spin"
                    aria-hidden="true"
                />
                <Plus v-else aria-hidden="true" />
                {{ creating ? 'Creando plantilla…' : 'Nueva plantilla' }}
            </Button>
        </template>

        <!-- Mismo vacío que las tablas: icono y una sola frase. -->
        <Empty class="min-h-60 gap-3 border-0 p-6 md:p-10">
            <EmptyHeader class="gap-3">
                <EmptyMedia variant="icon" class="text-muted-foreground">
                    <Inbox aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle class="text-sm font-normal text-muted-foreground">
                    No hay una plantilla institucional. Cree la primera: trae el
                    formato oficial completo, listo para ajustar.
                </EmptyTitle>
            </EmptyHeader>
        </Empty>
    </PageFrame>
</template>
