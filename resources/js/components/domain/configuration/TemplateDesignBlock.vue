<script setup lang="ts">
import { router, useForm } from '@inertiajs/vue3';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import TemplateDocumentEditor from '@/components/domain/configuration/TemplateDocumentEditor.vue';
import TemplateDocumentView from '@/components/domain/configuration/TemplateDocumentView.vue';
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
import { registerLocalPurgeConfirmation } from '@/composables/usePurgeConfirmation';
import type { TableLayout } from '@/lib/tableLayout';
import { defaultDocument } from '@/lib/templateDocument';
import type {
    DocumentNode,
    DocumentField,
    TemplateVariable,
} from '@/lib/templateDocument';
import { templatePreviewFields } from '@/lib/templatePreview';

const props = defineProps<{
    templateId: string;
    block: {
        id: string;
        title: string;
        content_type: string;
        table: TableLayout | null;
        fields: DocumentField[];
        document?: DocumentNode | null;
        fingerprint?: string;
    };
    identification: DocumentNode;
    variables: TemplateVariable[];
    readonly: boolean;
}>();
const open = ref(false);
const dirty = ref(false);
const discard = ref(false);
const submitting = ref(false);
const editor = ref<InstanceType<typeof TemplateDocumentEditor> | null>(null);
const draft = ref<DocumentNode>({ type: 'doc', content: [] });
const form = useForm({
    document: draft.value,
    fingerprint: '',
    confirm_purge: false,
});
const document = computed(
    () =>
        props.block.document ??
        defaultDocument(props.block, props.identification),
);
const variables = computed(() =>
    Object.fromEntries(props.variables.map((item) => [item.key, item.sample])),
);
const sampleFields = computed(() =>
    templatePreviewFields(props.block.fields, props.block.table),
);
const edit = () => {
    draft.value = JSON.parse(JSON.stringify(document.value)) as DocumentNode;
    form.clearErrors();
    form.fingerprint = props.block.fingerprint ?? '';
    form.confirm_purge = false;
    dirty.value = false;
    open.value = true;
};
const close = (value: boolean) => {
    if (value || form.processing) {
        return;
    }

    if (dirty.value) {
        discard.value = true;
    } else {
        open.value = false;
    }
};
const save = (value: DocumentNode) => {
    form.document = value;
    submitting.value = true;
    form.patch(
        TemplateController.updateDocument.url({
            template: props.templateId,
            block: props.block.id,
        }),
        {
            preserveScroll: true,
            onSuccess: () => {
                dirty.value = false;
                open.value = false;
                toast.success('Diseño guardado.');
            },
            onFinish: () => {
                submitting.value = false;
            },
        },
    );
};
const error = computed(() =>
    Object.entries(form.errors)
        .filter(([key]) => !['purge_count', 'purge_required'].includes(key))
        .map(([, value]) => value)
        .join(' '),
);
const purge = computed(
    () => (form.errors as Record<string, string>).purge_required,
);
const stopNavigation = router.on('before', (event) => {
    if (
        open.value &&
        dirty.value &&
        !submitting.value &&
        !window.confirm(
            'Hay cambios de diseño sin guardar. ¿Desea salir y descartarlos?',
        )
    ) {
        event.preventDefault();
    }
});
onBeforeUnmount(stopNavigation);
watch(open, (isOpen, _previous, onCleanup) => {
    if (isOpen) {
        onCleanup(
            registerLocalPurgeConfirmation(
                TemplateController.updateDocument.url({
                    template: props.templateId,
                    block: props.block.id,
                }),
            ),
        );
    }
});
</script>

<template>
    <div>
        <div
            v-if="!readonly && block.content_type !== 'flow'"
            class="mb-2 flex justify-end"
        >
            <Button
                type="button"
                variant="outline"
                size="sm"
                :aria-label="`Editar diseño de ${block.title}`"
                @click="edit"
                >Editar diseño</Button
            >
        </div>
        <TemplateDocumentView
            :document="document"
            :fields="sampleFields"
            :variables="variables"
            :layout="block.table"
            preview
        />
        <Dialog :open="open" @update:open="close">
            <DialogContent
                class="flex h-[92dvh] max-w-[calc(100%-1rem)] flex-col sm:max-w-6xl"
                :show-close-button="!form.processing"
                @interact-outside.prevent
            >
                <DialogHeader>
                    <DialogTitle>Diseño: {{ block.title }}</DialogTitle>
                    <DialogDescription
                        >Solo el administrador cambia este formato. El docente
                        completa los campos; las variables se llenan
                        automáticamente.</DialogDescription
                    >
                </DialogHeader>
                <TemplateDocumentEditor
                    v-if="open"
                    ref="editor"
                    :document="draft"
                    :variables="props.variables"
                    :pending="form.processing"
                    @dirty="dirty = $event"
                    @save="save"
                />
                <Alert v-if="error" variant="destructive"
                    ><AlertTitle>No se pudo guardar</AlertTitle
                    ><AlertDescription>{{ error }}</AlertDescription></Alert
                >
                <Alert v-if="purge" variant="destructive"
                    ><AlertTitle>Confirmación necesaria</AlertTitle
                    ><AlertDescription
                        >{{ purge }} Guardar y reiniciar elimina ese trabajo en
                        curso.</AlertDescription
                    ></Alert
                >
                <DialogFooter>
                    <span
                        class="mr-auto text-sm text-muted-foreground"
                        role="status"
                        >{{
                            form.processing
                                ? 'Guardando…'
                                : dirty
                                  ? 'Cambios sin guardar'
                                  : 'Sin cambios pendientes'
                        }}</span
                    >
                    <Button
                        type="button"
                        variant="outline"
                        :disabled="form.processing"
                        @click="close(false)"
                        >Cancelar</Button
                    >
                    <Button
                        v-if="purge"
                        type="button"
                        variant="destructive"
                        :disabled="form.processing"
                        @click="
                            form.confirm_purge = true;
                            editor?.save();
                        "
                        >Guardar y reiniciar</Button
                    >
                    <Button
                        v-else
                        type="button"
                        :disabled="form.processing"
                        @click="editor?.save()"
                        >Guardar diseño</Button
                    >
                </DialogFooter>
            </DialogContent>
        </Dialog>
        <Dialog v-model:open="discard">
            <DialogContent
                ><DialogHeader
                    ><DialogTitle>¿Descartar el diseño sin guardar?</DialogTitle
                    ><DialogDescription
                        >Se conserva el último diseño guardado de este
                        bloque.</DialogDescription
                    ></DialogHeader
                ><DialogFooter
                    ><Button
                        type="button"
                        variant="outline"
                        @click="discard = false"
                        >Seguir editando</Button
                    ><Button
                        type="button"
                        variant="destructive"
                        @click="
                            dirty = false;
                            discard = false;
                            open = false;
                        "
                        >Descartar cambios</Button
                    ></DialogFooter
                ></DialogContent
            >
        </Dialog>
    </div>
</template>
