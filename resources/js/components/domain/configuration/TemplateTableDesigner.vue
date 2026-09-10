<script setup lang="ts">
import type { PendingVisit, VisitOptions } from '@inertiajs/core';
import { router, useForm } from '@inertiajs/vue3';
import { Save, Trash2 } from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
import { registerLocalPurgeConfirmation } from '@/composables/usePurgeConfirmation';
import type { TableLayout } from '@/lib/tableLayout';
import type {
    DocumentField,
    DocumentNode,
    TemplateVariable,
} from '@/lib/templateDocument';
import { toast } from '@/lib/toast';
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
    ribbonTarget?: string;
}>();

const emit = defineEmits<{
    activate: [];
    'editing-change': [value: boolean];
}>();

const editing = ref(false);
const dirty = ref(false);
const discardOpen = ref(false);
const pendingNavigation = ref<PendingVisit | null>(null);
const draft = ref<DocumentNode>({ type: 'doc', content: [] });
const editor = ref<InstanceType<typeof TemplateTableEditor> | null>(null);
let bypassNavigationGuard = false;
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
    emit('activate');
};

const close = (force = false): void => {
    if (form.processing && !force) {
        return;
    }

    if (!force && dirty.value) {
        draft.value = editor.value?.getDocument() ?? draft.value;
        editing.value = false;
        discardOpen.value = true;

        return;
    }

    discardOpen.value = false;
    editing.value = false;
    dirty.value = false;
    form.clearErrors();
};

const resumeNavigation = (visit: PendingVisit): void => {
    const options: VisitOptions = {
        method: visit.method,
        data: visit.data,
        replace: visit.replace,
        preserveScroll: visit.preserveScroll,
        preserveState: visit.preserveState,
        only: visit.only,
        except: visit.except,
        headers: visit.headers,
        errorBag: visit.errorBag,
        forceFormData: visit.forceFormData,
        queryStringArrayFormat: visit.queryStringArrayFormat,
        async: visit.async,
        showProgress: visit.showProgress,
        prefetch: visit.prefetch,
        fresh: visit.fresh,
        reset: visit.reset,
        preserveUrl: visit.preserveUrl,
        preserveErrors: visit.preserveErrors,
        invalidateCacheTags: visit.invalidateCacheTags,
        viewTransition: visit.viewTransition,
        optimistic: visit.optimistic,
        component: visit.component,
        pageProps: visit.pageProps,
        cached: visit.cached,
    };

    bypassNavigationGuard = true;

    try {
        router.visit(visit.url, options);
    } finally {
        bypassNavigationGuard = false;
    }
};

const discardChanges = (): void => {
    const navigation = pendingNavigation.value;

    pendingNavigation.value = null;
    close(true);

    if (navigation) {
        resumeNavigation(navigation);
    }
};

const continueEditing = (): void => {
    pendingNavigation.value = null;
    discardOpen.value = false;
    editing.value = true;
};

const updateDiscardOpen = (open: boolean): void => {
    if (open) {
        discardOpen.value = true;

        return;
    }

    continueEditing();
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
        !bypassNavigationGuard &&
        editing.value &&
        dirty.value &&
        !form.processing &&
        event.detail.visit.method === 'get'
    ) {
        pendingNavigation.value = event.detail.visit;
        event.preventDefault();
        close();
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
        emit('editing-change', active);

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

defineExpose({ start });
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
            />
        </template>

        <template v-if="editing">
            <Teleport v-if="ribbonTarget" :to="`${ribbonTarget}-actions`">
                <div class="flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        :disabled="form.processing"
                        @click="close()"
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        size="sm"
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
                </div>
            </Teleport>

            <div class="mb-3 rounded-md border border-dashed px-3 py-2">
                <p class="text-sm font-medium">Editando: {{ blockTitle }}</p>
                <p class="text-xs text-muted-foreground">
                    Seleccione celdas y use la cinta superior para dar formato.
                </p>
            </div>

            <TemplateTableEditor
                ref="editor"
                :document="draft"
                :pending="form.processing"
                :font-family="appearance.font_family"
                :font-size="appearance.body_font_size"
                :text-color="appearance.text_color"
                :body-alignment="appearance.body_alignment"
                :colors="colors"
                :fields="fields"
                :variables="variables"
                :layout="layout"
                :toolbar-target="
                    ribbonTarget ? `${ribbonTarget}-tools` : undefined
                "
                @dirty="dirty = $event"
            />

            <Alert v-if="error" class="mt-4" variant="destructive">
                <AlertTitle>No se pudo guardar la tabla</AlertTitle>
                <AlertDescription>{{ error }}</AlertDescription>
            </Alert>

            <Alert v-if="purge" class="mt-4" variant="destructive">
                <AlertTitle>Confirmación necesaria</AlertTitle>
                <AlertDescription class="flex flex-wrap items-center gap-2">
                    <span>
                        {{ purge }} Guardar y reiniciar elimina ese trabajo en
                        curso.
                    </span>
                    <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        :disabled="form.processing"
                        @click="confirmAndSave"
                    >
                        <Save data-icon="inline-start" aria-hidden="true" />
                        Guardar y reiniciar
                    </Button>
                </AlertDescription>
            </Alert>
        </template>

        <Dialog :open="discardOpen" @update:open="updateDiscardOpen">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Descartar cambios de tabla</DialogTitle>
                    <DialogDescription>
                        Hay cambios de tabla sin guardar. ¿Desea descartarlos?
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        @click="continueEditing"
                    >
                        Seguir editando
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        @click="discardChanges"
                    >
                        <Trash2 data-icon="inline-start" aria-hidden="true" />
                        Descartar cambios
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
