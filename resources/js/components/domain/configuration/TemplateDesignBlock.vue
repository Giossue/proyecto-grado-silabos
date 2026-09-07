<script setup lang="ts">
import { router, useForm } from '@inertiajs/vue3';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import TemplateDocumentEditor from '@/components/domain/configuration/TemplateDocumentEditor.vue';
import TemplateDocumentView from '@/components/domain/configuration/TemplateDocumentView.vue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
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
        fields: (DocumentField & {
            help?: string | null;
            ai_enabled?: boolean;
        })[];
        document?: DocumentNode | null;
        fingerprint?: string;
    };
    identification: DocumentNode;
    variables: TemplateVariable[];
    readonly: boolean;
}>();
const open = ref(false);
const designDirty = ref(false);
const tab = ref('design');
const initialProperties = ref('');
const isFlow = computed(() => props.block.content_type === 'flow');
const discard = ref(false);
const submitting = ref(false);
const editor = ref<InstanceType<typeof TemplateDocumentEditor> | null>(null);
const draft = ref<DocumentNode>({ type: 'doc', content: [] });
const form = useForm({
    document: draft.value as DocumentNode | null,
    title: '',
    properties: [] as { key: string; help: string; ai_enabled?: boolean }[],
    fingerprint: '',
    confirm_purge: false,
});
const propertiesSnapshot = () => JSON.stringify([form.title, form.properties]);
const dirty = computed(
    () => designDirty.value || propertiesSnapshot() !== initialProperties.value,
);
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
    form.title = props.block.title;
    form.properties = props.block.fields.map((field) => ({
        key: field.key,
        help: field.help ?? '',
        ...(!field.inherited &&
        !['institutional', 'flow'].includes(props.block.content_type)
            ? { ai_enabled: field.ai_enabled ?? false }
            : {}),
    }));
    initialProperties.value = propertiesSnapshot();
    designDirty.value = false;
    tab.value = isFlow.value ? 'properties' : 'design';
    open.value = true;
};
defineExpose({ edit });
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
const save = (value: DocumentNode | null) => {
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
                designDirty.value = false;
                initialProperties.value = propertiesSnapshot();
                open.value = false;
                toast.success('Diseño guardado.');
            },
            onError: (errors) => {
                if (
                    Object.keys(errors).some(
                        (key) =>
                            key === 'title' || key.startsWith('properties'),
                    )
                ) {
                    tab.value = 'properties';
                }
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
const propertyError = (key: string) =>
    (form.errors as Record<string, string>)[key];
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
const unsaved = (event: BeforeUnloadEvent) => {
    if (open.value && dirty.value && !form.processing) {
        event.preventDefault();
    }
};
onMounted(() => window.addEventListener('beforeunload', unsaved));
onBeforeUnmount(() => window.removeEventListener('beforeunload', unsaved));
const submit = () => (isFlow.value ? save(null) : editor.value?.save());
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
        <div v-if="!readonly" class="mb-2 flex justify-end">
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
                <Tabs v-if="open" v-model="tab" class="min-h-0 flex-1">
                    <TabsList aria-label="Configuración del diseño">
                        <TabsTrigger v-if="!isFlow" value="design"
                            >Diseño</TabsTrigger
                        >
                        <TabsTrigger value="properties"
                            >Propiedades</TabsTrigger
                        >
                    </TabsList>
                    <TabsContent
                        v-if="!isFlow"
                        v-show="tab === 'design'"
                        value="design"
                        force-mount
                        class="flex min-h-0 flex-col"
                    >
                        <TemplateDocumentEditor
                            ref="editor"
                            :document="draft"
                            :variables="props.variables"
                            :pending="form.processing"
                            :field-keys="block.fields.map((field) => field.key)"
                            @dirty="designDirty = $event"
                            @save="save"
                        />
                    </TabsContent>
                    <TabsContent
                        value="properties"
                        class="min-h-0 overflow-y-auto rounded-lg border p-4"
                    >
                        <FieldGroup class="mx-auto max-w-2xl">
                            <Field :data-invalid="Boolean(form.errors.title)">
                                <FieldLabel for="design-title"
                                    >Nombre en la plantilla</FieldLabel
                                >
                                <Input
                                    id="design-title"
                                    v-model="form.title"
                                    maxlength="180"
                                    :disabled="form.processing"
                                    :aria-invalid="Boolean(form.errors.title)"
                                />
                                <FieldError
                                    v-if="form.errors.title"
                                    :errors="[form.errors.title]"
                                />
                                <FieldDescription
                                    >El nombre y las propiedades se guardan
                                    junto con el diseño.</FieldDescription
                                >
                            </Field>
                            <p
                                v-if="isFlow"
                                class="text-sm text-muted-foreground"
                            >
                                El estado de revisión lo determina el sistema.
                                Aquí solo se ajustan el nombre y la ayuda.
                            </p>
                            <FieldGroup
                                v-for="(property, index) in form.properties"
                                :key="property.key"
                                class="gap-4 rounded-lg border p-4"
                            >
                                <h3 class="text-sm font-medium">
                                    {{ block.fields[index]?.label }}
                                </h3>
                                <Field
                                    :data-invalid="
                                        Boolean(
                                            propertyError(
                                                `properties.${index}.help`,
                                            ),
                                        )
                                    "
                                >
                                    <FieldLabel :for="`design-help-${index}`"
                                        >Ayuda para el docente</FieldLabel
                                    >
                                    <Textarea
                                        :id="`design-help-${index}`"
                                        v-model="property.help"
                                        maxlength="2000"
                                        placeholder="Ej. Describa los resultados en infinitivo"
                                        :disabled="form.processing"
                                        :aria-invalid="
                                            Boolean(
                                                propertyError(
                                                    `properties.${index}.help`,
                                                ),
                                            )
                                        "
                                    />
                                    <FieldError
                                        v-if="
                                            propertyError(
                                                `properties.${index}.help`,
                                            )
                                        "
                                        :errors="[
                                            propertyError(
                                                `properties.${index}.help`,
                                            ),
                                        ]"
                                    />
                                </Field>
                                <Field
                                    v-if="property.ai_enabled !== undefined"
                                    orientation="horizontal"
                                >
                                    <Checkbox
                                        :id="`design-ai-${index}`"
                                        v-model="property.ai_enabled"
                                        :disabled="form.processing"
                                    />
                                    <FieldContent>
                                        <FieldLabel :for="`design-ai-${index}`"
                                            >Permite asistencia de
                                            IA</FieldLabel
                                        >
                                        <FieldDescription
                                            >Habilita la ayuda de IA; el docente
                                            sigue siendo responsable del
                                            contenido.</FieldDescription
                                        >
                                    </FieldContent>
                                </Field>
                            </FieldGroup>
                            <p
                                v-if="!isFlow"
                                class="text-sm text-muted-foreground"
                            >
                                Para configurar la ayuda de un campo nuevo,
                                primero guarde su diseño.
                            </p>
                        </FieldGroup>
                    </TabsContent>
                </Tabs>
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
                            submit();
                        "
                        >Guardar y reiniciar</Button
                    >
                    <Button
                        v-else
                        type="button"
                        :disabled="form.processing"
                        @click="submit"
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
                            designDirty = false;
                            initialProperties = propertiesSnapshot();
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
