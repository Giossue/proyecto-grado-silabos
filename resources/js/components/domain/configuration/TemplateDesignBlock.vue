<script setup lang="ts">
import { router, useForm } from '@inertiajs/vue3';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import TemplateDocumentEditor from '@/components/domain/configuration/TemplateDocumentEditor.vue';
import TemplateDocumentView from '@/components/domain/configuration/TemplateDocumentView.vue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { registerLocalPurgeConfirmation } from '@/composables/usePurgeConfirmation';
import type { TableLayout } from '@/lib/tableLayout';
import { defaultDocument, nodesOfType } from '@/lib/templateDocument';
import type {
    DocumentNode,
    DocumentField,
    TemplateVariable,
} from '@/lib/templateDocument';
import { templatePreviewFields } from '@/lib/templatePreview';
import { toast } from '@/lib/toast';

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
    editing?: boolean;
}>();
const emit = defineEmits<{
    dirty: [value: boolean];
}>();
const propertiesOpen = ref(false);
const designDirty = ref(false);
const initialProperties = ref('');
const isFlow = computed(() => props.block.content_type === 'flow');
const open = computed(() => Boolean(props.editing) && !isFlow.value);
const submitting = ref(false);
const editor = ref<InstanceType<typeof TemplateDocumentEditor> | null>(null);
const draft = ref<DocumentNode>({ type: 'doc', content: [] });
const form = useForm({
    document: draft.value as DocumentNode | null,
    title: '',
    properties: [] as {
        key: string;
        label: string;
        help: string;
        ai_enabled?: boolean;
    }[],
    fingerprint: '',
    confirm_purge: false,
});
const singleField = computed(
    () => !isFlow.value && form.properties.length === 1,
);
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
        label:
            !isFlow.value && props.block.fields.length === 1
                ? props.block.title
                : field.label,
        help: field.help ?? '',
        ...(!field.inherited &&
        !['institutional', 'flow'].includes(props.block.content_type)
            ? { ai_enabled: field.ai_enabled ?? false }
            : {}),
    }));
    initialProperties.value = propertiesSnapshot();
    designDirty.value = false;
};
const openProperties = () => {
    const current = editor.value?.prepareDocument();

    if (current && !isFlow.value) {
        for (const node of nodesOfType(current, 'field')) {
            const key = String(node.attrs?.key ?? '');

            if (
                key &&
                !form.properties.some((property) => property.key === key)
            ) {
                form.properties.push({
                    key,
                    label: String(node.attrs?.label ?? 'Respuesta del docente'),
                    help: '',
                    ai_enabled: false,
                });
            }
        }
    }

    propertiesOpen.value = true;
};
const closeProperties = (value: boolean) => {
    if (value) {
        propertiesOpen.value = true;

        return;
    }

    propertiesOpen.value = false;
};
const persist = (
    value: DocumentNode | null,
    silent = false,
): Promise<boolean> => {
    form.document = value;
    submitting.value = true;

    return new Promise((resolve) => {
        let succeeded = false;
        form.patch(
            TemplateController.updateDocument.url({
                template: props.templateId,
                block: props.block.id,
            }),
            {
                preserveScroll: true,
                onSuccess: () => {
                    succeeded = true;
                    designDirty.value = false;
                    initialProperties.value = propertiesSnapshot();
                    editor.value?.markClean();

                    if (!silent) {
                        toast.success('Diseño guardado.');
                    }
                },
                onError: (errors) => {
                    if (
                        Object.keys(errors).some(
                            (key) =>
                                key === 'title' || key.startsWith('properties'),
                        )
                    ) {
                        propertiesOpen.value = true;
                    }
                },
                onFinish: () => {
                    submitting.value = false;
                    resolve(succeeded);
                },
            },
        );
    });
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
const primaryNameError = computed(
    () =>
        form.errors.title ??
        (singleField.value ? propertyError('properties.0.label') : undefined),
);
const updatePrimaryName = (value: string | number) => {
    const name = String(value);

    if (singleField.value) {
        form.properties[0].label = name;
    }

    form.title = name;
};
const stopNavigation = router.on('before', (event) => {
    if (
        (props.editing || propertiesOpen.value) &&
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
    if (
        (props.editing || propertiesOpen.value) &&
        dirty.value &&
        !form.processing
    ) {
        event.preventDefault();
    }
};
onMounted(() => window.addEventListener('beforeunload', unsaved));
onBeforeUnmount(() => window.removeEventListener('beforeunload', unsaved));
const saveCurrent = (silent = false): Promise<boolean> => {
    if (!dirty.value) {
        return Promise.resolve(true);
    }

    const value = isFlow.value ? null : editor.value?.prepareDocument();

    if (!isFlow.value && !value) {
        return Promise.resolve(false);
    }

    return persist(value ?? null, silent);
};
const submit = () => void saveCurrent();
defineExpose({ edit, openProperties, save: saveCurrent });
watch(dirty, (value) => emit('dirty', value), { immediate: true });
watch(
    () => props.editing,
    (value) => {
        if (value) {
            edit();
        } else {
            propertiesOpen.value = false;
        }
    },
    { immediate: true },
);
watch(
    () => props.block.fingerprint,
    (value) => {
        if (!dirty.value) {
            form.fingerprint = value ?? '';
        }
    },
);
watch(
    () => Boolean(props.editing) || propertiesOpen.value,
    (isActive, _previous, onCleanup) => {
        if (!isActive) {
            return;
        }

        onCleanup(
            registerLocalPurgeConfirmation(
                TemplateController.updateDocument.url({
                    template: props.templateId,
                    block: props.block.id,
                }),
            ),
        );
    },
);
</script>

<template>
    <div>
        <TemplateDocumentView
            v-if="!open"
            :document="document"
            :fields="sampleFields"
            :variables="variables"
            :layout="block.table"
            preview
        />
        <div
            v-else
            class="relative flex flex-col gap-2"
            role="region"
            :aria-label="`Editar diseño de ${block.title}`"
        >
            <TemplateDocumentEditor
                ref="editor"
                :document="draft"
                :variables="props.variables"
                :pending="form.processing"
                :field-keys="block.fields.map((field) => field.key)"
                embedded
                @dirty="designDirty = $event"
                @properties="openProperties"
                @save="persist"
            />
            <Alert v-if="error" variant="destructive"
                ><AlertTitle>No se pudo guardar</AlertTitle
                ><AlertDescription>{{ error }}</AlertDescription></Alert
            >
            <Alert v-if="purge" variant="destructive"
                ><AlertTitle>Confirmación necesaria</AlertTitle
                ><AlertDescription class="flex flex-wrap items-center gap-2"
                    ><span
                        >{{ purge }} Guardar y reiniciar elimina ese trabajo en
                        curso.</span
                    ><Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        :disabled="form.processing"
                        @click="
                            form.confirm_purge = true;
                            submit();
                        "
                        >Guardar y reiniciar</Button
                    ></AlertDescription
                ></Alert
            >
        </div>

        <Sheet :open="propertiesOpen" @update:open="closeProperties">
            <SheetContent class="w-full overflow-y-auto sm:max-w-md">
                <SheetHeader>
                    <SheetTitle>Propiedades de {{ block.title }}</SheetTitle>
                    <SheetDescription>
                        Configure el bloque y los campos que completará el
                        docente.
                    </SheetDescription>
                </SheetHeader>
                <div class="px-4 pb-4">
                    <FieldGroup class="mx-auto max-w-2xl">
                        <Field :data-invalid="Boolean(primaryNameError)">
                            <FieldLabel for="design-title"
                                >Nombre del bloque</FieldLabel
                            >
                            <Input
                                id="design-title"
                                :model-value="form.title"
                                placeholder="Ej. Identificación de la asignatura"
                                @update:model-value="updatePrimaryName"
                                maxlength="180"
                                :disabled="form.processing"
                                :aria-invalid="Boolean(primaryNameError)"
                            />
                            <FieldError
                                v-if="primaryNameError"
                                :errors="[primaryNameError]"
                            />
                            <FieldDescription>
                                <template v-if="singleField">
                                    Al tener un solo campo, basta este nombre.
                                    Si agrega otro, aparecerá el nombre de cada
                                    campo.
                                </template>
                                <template v-else>
                                    Identifica el bloque completo; cada campo
                                    conserva su propio nombre.
                                </template>
                            </FieldDescription>
                        </Field>
                        <p v-if="isFlow" class="text-sm text-muted-foreground">
                            El estado de revisión lo determina el sistema. Aquí
                            solo se ajustan el nombre y la ayuda.
                        </p>
                        <FieldGroup
                            v-for="(property, index) in form.properties"
                            :key="property.key"
                            class="gap-4 rounded-lg border p-4"
                        >
                            <Field
                                v-if="!isFlow && !singleField"
                                :data-invalid="
                                    Boolean(
                                        propertyError(
                                            `properties.${index}.label`,
                                        ),
                                    )
                                "
                            >
                                <FieldLabel :for="`design-label-${index}`"
                                    >Nombre del campo</FieldLabel
                                >
                                <Input
                                    :id="`design-label-${index}`"
                                    v-model="property.label"
                                    maxlength="180"
                                    placeholder="Ej. Objetivo general"
                                    :disabled="form.processing"
                                    :aria-invalid="
                                        Boolean(
                                            propertyError(
                                                `properties.${index}.label`,
                                            ),
                                        )
                                    "
                                />
                                <FieldError
                                    v-if="
                                        propertyError(
                                            `properties.${index}.label`,
                                        )
                                    "
                                    :errors="[
                                        propertyError(
                                            `properties.${index}.label`,
                                        ),
                                    ]"
                                />
                            </Field>
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
                                        >Permite asistencia de IA</FieldLabel
                                    >
                                    <FieldDescription
                                        >Habilita la ayuda de IA; el docente
                                        sigue siendo responsable del
                                        contenido.</FieldDescription
                                    >
                                </FieldContent>
                            </Field>
                        </FieldGroup>
                        <p v-if="!isFlow" class="text-sm text-muted-foreground">
                            Para configurar la ayuda de un campo nuevo, primero
                            guarde su diseño.
                        </p>
                    </FieldGroup>
                </div>
                <Alert v-if="error" variant="destructive" class="mx-4"
                    ><AlertTitle>No se pudo guardar</AlertTitle
                    ><AlertDescription>{{ error }}</AlertDescription></Alert
                >
                <Alert v-if="purge" variant="destructive" class="mx-4"
                    ><AlertTitle>Confirmación necesaria</AlertTitle
                    ><AlertDescription
                        >{{ purge }} Guardar y reiniciar elimina ese trabajo en
                        curso.</AlertDescription
                    ></Alert
                >
                <SheetFooter class="mt-auto">
                    <span
                        class="mr-auto text-sm text-muted-foreground"
                        role="status"
                    >
                        {{
                            form.processing
                                ? 'Guardando…'
                                : dirty
                                  ? 'Cambios sin guardar'
                                  : 'Sin cambios pendientes'
                        }}
                    </span>
                    <Button
                        type="button"
                        variant="outline"
                        :disabled="form.processing"
                        @click="closeProperties(false)"
                    >
                        {{ isFlow ? 'Cancelar' : 'Cerrar' }}
                    </Button>
                    <Button
                        v-if="purge"
                        type="button"
                        variant="destructive"
                        :disabled="form.processing"
                        @click="
                            form.confirm_purge = true;
                            submit();
                        "
                    >
                        Guardar y reiniciar
                    </Button>
                    <Button
                        v-else
                        type="button"
                        :disabled="form.processing"
                        @click="submit"
                    >
                        Guardar diseño
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    </div>
</template>
