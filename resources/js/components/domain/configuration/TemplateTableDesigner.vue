<script setup lang="ts">
import { router, useForm } from '@inertiajs/vue3';
import { Save, TableProperties, X } from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import TemplateDocumentView from '@/components/domain/configuration/TemplateDocumentView.vue';
import TemplateTableEditor from '@/components/domain/configuration/TemplateTableEditor.vue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { registerLocalPurgeConfirmation } from '@/composables/usePurgeConfirmation';
import type { TableLayout } from '@/lib/tableLayout';
import type {
    DocumentField,
    DocumentNode,
    TemplateVariable,
} from '@/lib/templateDocument';
import type { TemplateAppearance } from '@/types/configuration';

const props = defineProps<{
    templateId: string;
    blockId: string;
    blockTitle: string;
    fingerprint: string;
    document: DocumentNode;
    fields: DocumentField[];
    variables: TemplateVariable[];
    variableSamples: Record<string, string>;
    layout: TableLayout | null;
    appearance: TemplateAppearance;
    colors: { value: string; label: string }[];
}>();

const editing = ref(false);
const dirty = ref(false);
const draft = ref<DocumentNode>({ type: 'doc', content: [] });
const editor = ref<InstanceType<typeof TemplateTableEditor> | null>(null);
const form = useForm({
    document: null as DocumentNode | null,
    fingerprint: props.fingerprint,
    confirm_purge: false,
});

const url = computed(() =>
    TemplateController.updateDocument.url({
        template: props.templateId,
        block: props.blockId,
    }),
);

const error = computed(() =>
    Object.entries(form.errors)
        .filter(
            ([key, value]) =>
                Boolean(value) &&
                !['purge_count', 'purge_required'].includes(key),
        )
        .map(([, value]) => value)
        .join(' '),
);

const purge = computed(
    () => (form.errors as Record<string, string>).purge_required,
);

const start = (): void => {
    draft.value = JSON.parse(JSON.stringify(props.document)) as DocumentNode;
    form.clearErrors();
    form.fingerprint = props.fingerprint;
    form.confirm_purge = false;
    dirty.value = false;
    editing.value = true;
};

const close = (force = false): void => {
    if (form.processing && !force) {
        return;
    }

    if (
        !force &&
        dirty.value &&
        !window.confirm(
            'Hay cambios de tabla sin guardar. ¿Desea descartarlos?',
        )
    ) {
        return;
    }

    editing.value = false;
    dirty.value = false;
    form.clearErrors();
};

const updateDialogOpen = (open: boolean): void => {
    if (!open) {
        close();
    }
};

const save = (): void => {
    const value = editor.value?.getDocument();

    if (!value) {
        return;
    }

    form.document = value;
    form.patch(url.value, {
        preserveScroll: true,
        onSuccess: () => {
            toast.success('Tabla guardada.');
            close(true);
        },
        onError: (errors) => {
            if (!('purge_required' in errors)) {
                toast.error(
                    Object.values(errors)[0] ?? 'No se pudo guardar la tabla.',
                );
            }
        },
    });
};

const confirmAndSave = (): void => {
    form.confirm_purge = true;
    save();
};

const stopNavigation = router.on('before', (event) => {
    if (
        editing.value &&
        dirty.value &&
        !form.processing &&
        !window.confirm(
            'Hay cambios de tabla sin guardar. ¿Desea salir y descartarlos?',
        )
    ) {
        event.preventDefault();
    }
});

const beforeUnload = (event: BeforeUnloadEvent): void => {
    if (editing.value && dirty.value && !form.processing) {
        event.preventDefault();
    }
};

onMounted(() => window.addEventListener('beforeunload', beforeUnload));
onBeforeUnmount(() => {
    stopNavigation();
    window.removeEventListener('beforeunload', beforeUnload);
});

watch(
    editing,
    (active, _previous, onCleanup) => {
        if (active) {
            onCleanup(registerLocalPurgeConfirmation(url.value));
        }
    },
    { immediate: true },
);

watch(
    () => props.fingerprint,
    (fingerprint) => {
        if (!editing.value) {
            form.fingerprint = fingerprint;
        }
    },
);
</script>

<template>
    <div class="min-w-0">
        <template v-if="!editing">
            <TemplateDocumentView
                :document="document"
                :fields="fields"
                :variables="variableSamples"
                :layout="layout"
                :font-family="appearance.font_family"
                :font-size="appearance.body_font_size"
                :text-color="appearance.text_color"
                :text-align="appearance.body_alignment"
                :table-header-background="appearance.table_header_background"
                :table-header-color="appearance.table_header_color"
                preview
            >
                <template #table-action>
                    <Tooltip>
                        <TooltipTrigger as-child>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon-sm"
                                class="size-7"
                                :aria-label="`Editar tabla: ${blockTitle}`"
                                @click="start"
                            >
                                <TableProperties aria-hidden="true" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Editar tabla</TooltipContent>
                    </Tooltip>
                </template>
            </TemplateDocumentView>
        </template>

        <Dialog v-if="editing" :open="editing" @update:open="updateDialogOpen">
            <DialogContent
                class="flex h-[min(90vh,60rem)] max-w-[min(96vw,80rem)] flex-col gap-0 p-0"
            >
                <DialogHeader class="shrink-0 border-b px-6 py-4 pr-12">
                    <DialogTitle>Editar tabla: {{ blockTitle }}</DialogTitle>
                    <DialogDescription>
                        Seleccione celdas para aplicar formato, combinar o
                        modificar filas y columnas.
                    </DialogDescription>
                </DialogHeader>

                <div class="min-h-0 flex-1 overflow-auto p-6">
                    <TemplateTableEditor
                        ref="editor"
                        :document="draft"
                        :pending="form.processing"
                        :font-family="appearance.font_family"
                        :font-size="appearance.body_font_size"
                        :text-color="appearance.text_color"
                        :body-alignment="appearance.body_alignment"
                        :colors="colors"
                        @dirty="dirty = $event"
                    />

                    <Alert v-if="error" class="mt-4" variant="destructive">
                        <AlertTitle>No se pudo guardar la tabla</AlertTitle>
                        <AlertDescription>{{ error }}</AlertDescription>
                    </Alert>

                    <Alert v-if="purge" class="mt-4" variant="destructive">
                        <AlertTitle>Confirmación necesaria</AlertTitle>
                        <AlertDescription
                            class="flex flex-wrap items-center gap-2"
                        >
                            <span>
                                {{ purge }} Guardar y reiniciar elimina ese
                                trabajo en curso.
                            </span>
                            <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                :disabled="form.processing"
                                @click="confirmAndSave"
                            >
                                Guardar y reiniciar
                            </Button>
                        </AlertDescription>
                    </Alert>
                </div>

                <DialogFooter class="shrink-0 border-t bg-card px-6 py-4">
                    <Button
                        type="button"
                        variant="outline"
                        :disabled="form.processing"
                        @click="close()"
                    >
                        <X data-icon="inline-start" aria-hidden="true" />
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        :disabled="form.processing || !dirty"
                        @click="save"
                    >
                        <Spinner
                            v-if="form.processing"
                            data-icon="inline-start"
                            aria-hidden="true"
                        />
                        <Save
                            v-else
                            data-icon="inline-start"
                            aria-hidden="true"
                        />
                        Guardar tabla
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
