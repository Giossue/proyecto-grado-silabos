<script setup lang="ts">
import { Form, Head, Link, router } from '@inertiajs/vue3';
import {
    AlertTriangle,
    CheckCircle2,
    RotateCcw,
    Save,
    Send,
    Trash2,
} from '@lucide/vue';
import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import AiAssistanceController from '@/actions/App/Modules/AiAssistance/Presentation/Http/Controllers/AiAssistanceController';
import SyllabusController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/SyllabusController';
import PageFrame from '@/components/domain/PageFrame.vue';
import IdentificationCard from '@/components/domain/syllabus/IdentificationCard.vue';
import type {IdentificationPair} from '@/components/domain/syllabus/IdentificationCard.vue';
import SyllabusTableEditor from '@/components/domain/syllabus/SyllabusTableEditor.vue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { defaultTableLayout } from '@/lib/tableLayout';
import type { TableLayout, TableRowData } from '@/lib/tableLayout';
import { index as syllabiIndex } from '@/routes/syllabi';

type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue };

type DraftRow = {
    id: string | null;
    data: TableRowData;
};

type DraftField = {
    id: string;
    key: string;
    label: string;
    help: string | null;
    type: string;
    options: { value: string; label: string }[];
    required: boolean;
    inherited: boolean;
    teacher_editable: boolean;
    ai_enabled: boolean;
    value: JsonValue;
    rows: DraftRow[];
};

type DraftSection = {
    id: string;
    key: string;
    title: string;
    description: string | null;
    blocks: {
        id: string;
        title: string;
        content_type: string;
        table: TableLayout | null;
        fields: DraftField[];
    }[];
};

type ValidationSummary = {
    completed_at: string;
    blocking_errors: number;
    warnings: number;
    results: {
        field_id: string | null;
        code: string;
        severity: string;
        message: string;
    }[];
};

type ReviewObservation = {
    id: string;
    revision_number: number;
    content: string;
    state: string;
    requested: boolean;
    response: {
        content: string;
        responded_at: string;
        fixed: boolean;
    } | null;
};

const props = defineProps<{
    syllabus: {
        id: string;
        subject: string;
        code: string;
        convocation: string;
        period: string;
        state: string;
        version_bloqueo: number;
        completion: number;
        guardado_en: string | null;
        parallels: string[];
        teachers: string[];
        identification: IdentificationPair[][];
        sections: DraftSection[];
        validation: ValidationSummary | null;
        observations: ReviewObservation[];
        reopening: {
            cause: string;
            reopened_at: string;
            reopened_by: string;
        } | null;
    };
}>();

defineOptions({
    layout: { breadcrumbs: [{ title: 'Mis sílabos', href: syllabiIndex() }] },
});

type FieldState = {
    value: string | number | boolean | string[];
    rows: DraftRow[];
    status: 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';
    error: string | null;
};

const allFields = props.syllabus.sections.flatMap((section) =>
    section.blocks.flatMap((block) => block.fields),
);
const fieldsById = new Map(allFields.map((field) => [field.id, field]));
const fieldStates = reactive<Record<string, FieldState>>(
    Object.fromEntries(
        allFields.map((field) => [
            field.id,
            {
                value: Array.isArray(field.value)
                    ? field.value.map(String)
                    : typeof field.value === 'string' ||
                        typeof field.value === 'number' ||
                        typeof field.value === 'boolean'
                      ? field.value
                      : field.value === null
                        ? ''
                        : JSON.stringify(field.value),
                rows: field.rows.map((row) => ({
                    id: row.id,
                    data: { ...row.data },
                })),
                status: 'idle',
                error: null,
            },
        ]),
    ),
);

const lockVersion = ref(props.syllabus.version_bloqueo);
const savedAt = ref(props.syllabus.guardado_en);
const globalSaving = ref(false);
const validating = ref(false);
const preparingSubmission = ref(false);
const conflict = ref(false);
const pendingFieldIds = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

const saveLabel = computed(() => {
    if (conflict.value) {
        return 'Conflicto detectado';
    }

    if (globalSaving.value || timers.size > 0) {
        return 'Guardando cambios…';
    }

    if (!savedAt.value) {
        return 'Sin guardados';
    }

    return `Guardado ${new Intl.DateTimeFormat('es-EC', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).format(new Date(savedAt.value))}`;
});

const csrfToken =
    document
        .querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
        ?.getAttribute('content') ?? '';

const masterValue = (value: JsonValue): string => {
    if (value === null) {
        return 'Dato no disponible';
    }

    if (typeof value !== 'object') {
        return String(value);
    }

    if (Array.isArray(value)) {
        return value.map(String).join(', ');
    }

    return Object.entries(value)
        .map(
            ([key, item]) =>
                `${key.replaceAll('_', ' ')}: ${String(item ?? '—')}`,
        )
        .join(' · ');
};

const validationFor = (fieldId: string) =>
    props.syllabus.validation?.results.filter(
        (result) => result.field_id === fieldId,
    ) ?? [];

const scheduleSave = (field: DraftField): void => {
    if (conflict.value || field.inherited || !field.teacher_editable) {
        return;
    }

    const previous = timers.get(field.id);

    if (previous) {
        clearTimeout(previous);
    }

    fieldStates[field.id].status = 'pending';
    const timer = setTimeout(() => {
        timers.delete(field.id);
        pendingFieldIds.add(field.id);
        void processQueue();
    }, 700);
    timers.set(field.id, timer);
};

const updateValue = (
    field: DraftField,
    value: string | number | boolean | string[],
): void => {
    fieldStates[field.id].value = value;
    scheduleSave(field);
};

const textValue = (fieldId: string): string | number => {
    const value = fieldStates[fieldId].value;

    return typeof value === 'string' || typeof value === 'number' ? value : '';
};

const booleanValue = (fieldId: string): boolean => {
    const value = fieldStates[fieldId].value;

    return value === true || value === 1 || value === '1';
};

const selectedOptions = (fieldId: string): string[] => {
    const value = fieldStates[fieldId].value;

    return Array.isArray(value) ? value : [];
};

const updateBoolean = (
    field: DraftField,
    value: boolean | 'indeterminate',
): void => {
    if (typeof value === 'boolean') {
        updateValue(field, value);
    }
};

const toggleOption = (
    field: DraftField,
    option: string,
    checked: boolean | 'indeterminate',
): void => {
    if (typeof checked !== 'boolean') {
        return;
    }

    const values = new Set(selectedOptions(field.id));

    if (checked) {
        values.add(option);
    } else {
        values.delete(option);
    }

    updateValue(field, [...values]);
};

const updateRow = (
    field: DraftField,
    index: number,
    value: string | number,
): void => {
    fieldStates[field.id].rows[index].data.texto = String(value);
    scheduleSave(field);
};

/** La cuadrícula de tabla entrega la lista completa de filas. */
const replaceRows = (field: DraftField, rows: DraftRow[]): void => {
    fieldStates[field.id].rows = rows;
    scheduleSave(field);
};

const addRow = (field: DraftField): void => {
    fieldStates[field.id].rows.push({ id: null, data: { texto: '' } });
    scheduleSave(field);
};

const removeRow = (field: DraftField, index: number): void => {
    fieldStates[field.id].rows.splice(index, 1);
    scheduleSave(field);
};

const queueNow = (field: DraftField): void => {
    const timer = timers.get(field.id);

    if (timer) {
        clearTimeout(timer);
        timers.delete(field.id);
    }

    pendingFieldIds.add(field.id);
    void processQueue();
};

const openAi = async (field: DraftField): Promise<void> => {
    const timer = timers.get(field.id);

    if (timer) {
        clearTimeout(timer);
        timers.delete(field.id);
        pendingFieldIds.add(field.id);
    }

    await processQueue();

    if (!conflict.value) {
        router.visit(
            AiAssistanceController.show.url({
                syllabus: props.syllabus.id,
                field: field.id,
            }),
        );
    }
};

const processQueue = async (): Promise<void> => {
    if (globalSaving.value || conflict.value) {
        return;
    }

    globalSaving.value = true;

    while (pendingFieldIds.size > 0 && !conflict.value) {
        const fieldId = pendingFieldIds.values().next().value as string;
        pendingFieldIds.delete(fieldId);
        const field = fieldsById.get(fieldId);

        if (field) {
            await saveField(field);
        }
    }

    globalSaving.value = false;
};

const saveField = async (field: DraftField): Promise<void> => {
    const state = fieldStates[field.id];
    state.status = 'saving';
    state.error = null;

    const body =
        field.type === 'repetible'
            ? {
                  version_bloqueo: lockVersion.value,
                  rows: state.rows.map((row) => ({
                      id: row.id,
                      data: row.data,
                  })),
              }
            : { version_bloqueo: lockVersion.value, value: state.value };

    try {
        const response = await fetch(
            SyllabusController.updateField.url({
                syllabus: props.syllabus.id,
                field: field.id,
            }),
            {
                method: 'PATCH',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify(body),
            },
        );
        const payload = (await response.json()) as {
            message?: string;
            version_bloqueo?: number;
            guardado_en?: string;
            version_bloqueo_actual?: number;
            errors?: Record<string, string[]>;
            rows?: { id: string; datos: DraftRow['data'] }[];
        };

        if (response.status === 409) {
            conflict.value = true;
            state.status = 'conflict';
            state.error =
                payload.message ??
                'Otra sesión guardó cambios. Recargue para comparar.';

            return;
        }

        if (!response.ok) {
            const firstError = payload.errors
                ? Object.values(payload.errors).flat()[0]
                : undefined;

            throw new Error(
                firstError ?? payload.message ?? 'No se pudo guardar.',
            );
        }

        lockVersion.value = payload.version_bloqueo ?? lockVersion.value;
        savedAt.value = payload.guardado_en ?? savedAt.value;

        if (field.type === 'repetible' && payload.rows) {
            state.rows = payload.rows.map((row) => ({
                id: row.id,
                data: row.datos,
            }));
        }

        state.status = 'saved';
    } catch (error) {
        state.status = 'error';
        state.error =
            error instanceof Error
                ? error.message
                : 'No se pudo guardar. Revise su conexión y reintente.';
    }
};

const runValidation = async (): Promise<void> => {
    for (const [fieldId, timer] of timers) {
        clearTimeout(timer);
        pendingFieldIds.add(fieldId);
    }

    timers.clear();
    await processQueue();

    if (conflict.value) {
        return;
    }

    validating.value = true;
    router.post(
        SyllabusController.validateDraft.url(props.syllabus.id),
        {},
        {
            preserveScroll: true,
            onFinish: () => {
                validating.value = false;
            },
        },
    );
};

const reloadAfterConflict = (): void => {
    router.reload();
};

const goToSubmission = async (): Promise<void> => {
    for (const [fieldId, timer] of timers) {
        clearTimeout(timer);
        pendingFieldIds.add(fieldId);
    }

    timers.clear();
    preparingSubmission.value = true;
    await processQueue();
    preparingSubmission.value = false;

    if (!conflict.value) {
        router.visit(
            SyllabusController.submitConfirmation.url(props.syllabus.id),
        );
    }
};

const stateLabel = computed(() =>
    props.syllabus.state === 'correccion_solicitada'
        ? 'Corrección solicitada'
        : 'Borrador',
);

const requestedObservations = computed(() =>
    props.syllabus.observations.filter(
        (observation) =>
            observation.requested && observation.state !== 'verificada',
    ),
);

const beforeUnload = (event: BeforeUnloadEvent): void => {
    if (globalSaving.value || timers.size > 0 || pendingFieldIds.size > 0) {
        event.preventDefault();
    }
};

window.addEventListener('beforeunload', beforeUnload);
onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', beforeUnload);

    for (const timer of timers.values()) {
        clearTimeout(timer);
    }
});
</script>

<template>
    <Head :title="`Editar ${syllabus.subject}`" />
    <PageFrame
        :title="syllabus.subject"
        :description="`${syllabus.code} · ${syllabus.convocation} · Paralelo(s) ${syllabus.parallels.join(', ')}`"
    >
        <template #eyebrow>
            <Button as-child variant="link" class="h-auto px-0">
                <Link :href="SyllabusController.show(syllabus.id)">
                    ← Volver al resumen
                </Link>
            </Button>
        </template>
        <template #meta>
            <Badge variant="secondary">{{ stateLabel }}</Badge>
            <!-- El estado de guardado informa, no acciona. Vive aquí para que no flote
                 junto a los botones en móvil; conserva `aria-live` para que el lector
                 anuncie los cambios. -->
            <span aria-live="polite">
                <Badge :variant="conflict ? 'destructive' : 'outline'">
                    <Spinner v-if="globalSaving" />
                    <CheckCircle2
                        v-else-if="!conflict && savedAt"
                        aria-hidden="true"
                    />
                    {{ saveLabel }}
                </Badge>
            </span>
        </template>
        <template #actions>
            <Button
                type="button"
                variant="outline"
                :disabled="globalSaving || validating || conflict"
                @click="runValidation"
            >
                <Spinner v-if="validating" />
                Validar borrador
            </Button>
            <Button
                type="button"
                :disabled="
                    globalSaving ||
                    validating ||
                    preparingSubmission ||
                    conflict
                "
                @click="goToSubmission"
            >
                <Spinner v-if="preparingSubmission" />
                <Send v-else aria-hidden="true" />
                Revisar y enviar
            </Button>
        </template>

        <Alert v-if="syllabus.state === 'correccion_solicitada'">
            <RotateCcw aria-hidden="true" />
            <AlertTitle>Está preparando una nueva revisión</AlertTitle>
            <AlertDescription>
                La revisión anterior ya fue enviada. Modifique el trabajo,
                responda las observaciones seleccionadas y reenvíe.
                <span v-if="syllabus.reopening" class="mt-2 block">
                    Causa de reapertura: {{ syllabus.reopening.cause }}
                </span>
            </AlertDescription>
        </Alert>

        <Alert v-if="conflict" variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle
                >No se sobrescribieron los cambios de otra sesión</AlertTitle
            >
            <AlertDescription
                class="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
                <span>
                    El servidor conserva la versión más reciente. Recargue el
                    expediente y vuelva a aplicar únicamente sus cambios
                    pendientes.
                </span>
                <Button
                    type="button"
                    variant="outline"
                    @click="reloadAfterConflict"
                >
                    Recargar
                </Button>
            </AlertDescription>
        </Alert>

        <Alert
            v-if="syllabus.validation"
            :variant="
                syllabus.validation.blocking_errors > 0
                    ? 'destructive'
                    : 'default'
            "
        >
            <AlertTitle>Validación del borrador</AlertTitle>
            <AlertDescription>
                {{ syllabus.validation.blocking_errors }} error(es)
                bloqueante(s) y
                {{ syllabus.validation.warnings }} advertencia(s). Este
                resultado no proviene de IA.
            </AlertDescription>
        </Alert>

        <div class="grid gap-6 xl:grid-cols-[15rem_minmax(0,1fr)_18rem]">
            <Card class="h-fit xl:sticky xl:top-4">
                <CardHeader>
                    <CardTitle>Secciones</CardTitle>
                    <CardDescription>Navegue por el documento.</CardDescription>
                </CardHeader>
                <CardContent>
                    <nav aria-label="Secciones del sílabo">
                        <ol class="flex flex-col gap-1">
                            <li
                                v-for="(section, index) in syllabus.sections"
                                :key="section.id"
                            >
                                <Button
                                    as-child
                                    variant="ghost"
                                    class="h-auto w-full justify-start text-left whitespace-normal"
                                >
                                    <a :href="`#section-${section.id}`">
                                        {{ index + 1 }}. {{ section.title }}
                                    </a>
                                </Button>
                            </li>
                        </ol>
                    </nav>
                </CardContent>
            </Card>

            <main class="flex min-w-0 flex-col gap-6">
                <Card
                    v-for="section in syllabus.sections"
                    :id="`section-${section.id}`"
                    :key="section.id"
                    class="scroll-mt-4"
                >
                    <CardHeader>
                        <CardTitle>{{ section.title }}</CardTitle>
                        <CardDescription>
                            {{
                                section.description ??
                                'Complete los campos aplicables.'
                            }}
                        </CardDescription>
                    </CardHeader>
                    <CardContent class="flex flex-col gap-6">
                        <div
                            v-for="block in section.blocks"
                            :key="block.id"
                            class="flex flex-col gap-5"
                        >
                            <h3 class="font-medium">{{ block.title }}</h3>
                            <Field
                                v-for="field in block.fields"
                                :key="field.id"
                                :data-invalid="
                                    fieldStates[field.id].status === 'error' ||
                                    validationFor(field.id).length > 0
                                "
                                :data-disabled="
                                    field.inherited || !field.teacher_editable
                                "
                            >
                                <div class="flex flex-wrap items-center gap-2">
                                    <FieldLabel
                                        :for="`field-${field.id}`"
                                        :required="field.required"
                                    >
                                        {{ field.label }}
                                    </FieldLabel>
                                    <Badge
                                        v-if="field.inherited"
                                        variant="outline"
                                    >
                                        Institucional · solo lectura
                                    </Badge>
                                </div>
                                <FieldDescription v-if="field.help">
                                    {{ field.help }}
                                </FieldDescription>

                                <IdentificationCard
                                    v-if="
                                        block.content_type === 'institutional'
                                    "
                                    :id="`field-${field.id}`"
                                    :rows="syllabus.identification"
                                />

                                <div
                                    v-else-if="
                                        field.inherited ||
                                        !field.teacher_editable
                                    "
                                    :id="`field-${field.id}`"
                                    class="rounded-md border bg-muted/30 p-3 text-sm"
                                    tabindex="0"
                                >
                                    {{ masterValue(field.value) }}
                                </div>

                                <SyllabusTableEditor
                                    v-else-if="
                                        field.type === 'repetible' &&
                                        block.content_type === 'table'
                                    "
                                    :field-id="field.id"
                                    :label="field.label"
                                    :layout="
                                        block.table ?? defaultTableLayout()
                                    "
                                    :rows="fieldStates[field.id].rows"
                                    :required="field.required"
                                    :invalid="
                                        validationFor(field.id).length > 0
                                    "
                                    @update:rows="replaceRows(field, $event)"
                                />

                                <div
                                    v-else-if="field.type === 'repetible'"
                                    class="flex flex-col gap-3"
                                >
                                    <div
                                        v-for="(row, rowIndex) in fieldStates[
                                            field.id
                                        ].rows"
                                        :key="row.id ?? `new-${rowIndex}`"
                                        class="flex items-start gap-2"
                                    >
                                        <Textarea
                                            :id="`field-${field.id}-row-${rowIndex}`"
                                            :model-value="
                                                String(row.data.texto ?? '')
                                            "
                                            :aria-label="`${field.label}, fila ${rowIndex + 1}`"
                                            :aria-invalid="
                                                validationFor(field.id).length >
                                                0
                                            "
                                            :aria-required="field.required"
                                            placeholder="Escriba un elemento estructurado"
                                            @update:model-value="
                                                updateRow(
                                                    field,
                                                    rowIndex,
                                                    $event,
                                                )
                                            "
                                        />
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            :aria-label="`Eliminar fila ${rowIndex + 1}`"
                                            @click="removeRow(field, rowIndex)"
                                        >
                                            <Trash2 aria-hidden="true" />
                                        </Button>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        class="self-start"
                                        @click="addRow(field)"
                                    >
                                        {{
                                            [
                                                'bulleted_list',
                                                'numbered_list',
                                            ].includes(block.content_type)
                                                ? 'Agregar elemento'
                                                : 'Agregar fila'
                                        }}
                                    </Button>
                                </div>

                                <Input
                                    v-else-if="
                                        [
                                            'texto_corto',
                                            'numero',
                                            'fecha',
                                        ].includes(field.type)
                                    "
                                    :id="`field-${field.id}`"
                                    :model-value="textValue(field.id)"
                                    :type="
                                        field.type === 'numero'
                                            ? 'number'
                                            : field.type === 'fecha'
                                              ? 'date'
                                              : 'text'
                                    "
                                    :placeholder="
                                        field.type === 'texto_corto'
                                            ? `Ej. ${field.label}`
                                            : undefined
                                    "
                                    :aria-invalid="
                                        validationFor(field.id).length > 0
                                    "
                                    :required="field.required"
                                    @update:model-value="
                                        updateValue(field, $event)
                                    "
                                />

                                <div
                                    v-else-if="field.type === 'booleano'"
                                    class="flex items-center gap-3"
                                >
                                    <Checkbox
                                        :id="`field-${field.id}`"
                                        :model-value="booleanValue(field.id)"
                                        :aria-invalid="
                                            validationFor(field.id).length > 0
                                        "
                                        :aria-required="field.required"
                                        @update:model-value="
                                            updateBoolean(field, $event)
                                        "
                                    />
                                    <span class="text-sm text-muted-foreground">
                                        Marque cuando corresponda.
                                    </span>
                                </div>

                                <Select
                                    v-else-if="field.type === 'seleccion_unica'"
                                    :model-value="String(textValue(field.id))"
                                    :required="field.required"
                                    @update:model-value="
                                        updateValue(field, String($event))
                                    "
                                >
                                    <SelectTrigger
                                        :id="`field-${field.id}`"
                                        :aria-invalid="
                                            validationFor(field.id).length > 0
                                        "
                                    >
                                        <SelectValue placeholder="Seleccione" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem
                                                v-for="option in field.options"
                                                :key="option.value"
                                                :value="option.value"
                                            >
                                                {{ option.label }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>

                                <FieldSet
                                    v-else-if="
                                        field.type === 'seleccion_multiple'
                                    "
                                    :aria-required="field.required"
                                >
                                    <FieldLegend
                                        class="sr-only"
                                        variant="label"
                                        :required="field.required"
                                    >
                                        {{ field.label }}
                                    </FieldLegend>
                                    <Field
                                        v-for="option in field.options"
                                        :key="option.value"
                                        orientation="horizontal"
                                    >
                                        <Checkbox
                                            :id="`field-${field.id}-${option.value}`"
                                            :model-value="
                                                selectedOptions(
                                                    field.id,
                                                ).includes(option.value)
                                            "
                                            @update:model-value="
                                                toggleOption(
                                                    field,
                                                    option.value,
                                                    $event,
                                                )
                                            "
                                        />
                                        <FieldLabel
                                            :for="`field-${field.id}-${option.value}`"
                                        >
                                            {{ option.label }}
                                        </FieldLabel>
                                    </Field>
                                </FieldSet>

                                <Textarea
                                    v-else
                                    :id="`field-${field.id}`"
                                    :model-value="textValue(field.id)"
                                    :aria-invalid="
                                        validationFor(field.id).length > 0
                                    "
                                    :required="field.required"
                                    class="min-h-32"
                                    @update:model-value="
                                        updateValue(field, $event)
                                    "
                                />

                                <FieldError
                                    :errors="[
                                        fieldStates[field.id].error ??
                                            undefined,
                                        ...validationFor(field.id).map(
                                            (result) => result.message,
                                        ),
                                    ]"
                                />
                                <div
                                    v-if="
                                        !field.inherited &&
                                        field.teacher_editable
                                    "
                                    class="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
                                    aria-live="polite"
                                >
                                    <span>
                                        {{
                                            fieldStates[field.id].status ===
                                            'saving'
                                                ? 'Guardando…'
                                                : fieldStates[field.id]
                                                        .status === 'pending'
                                                  ? 'Cambio pendiente'
                                                  : fieldStates[field.id]
                                                          .status === 'saved'
                                                    ? 'Campo guardado'
                                                    : ''
                                        }}
                                    </span>
                                    <span
                                        class="flex flex-wrap items-center gap-1"
                                    >
                                        <Button
                                            v-if="field.ai_enabled"
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            :disabled="globalSaving || conflict"
                                            @click="openAi(field)"
                                        >
                                            Asistencia IA
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            :disabled="
                                                globalSaving ||
                                                fieldStates[field.id].status ===
                                                    'saving' ||
                                                conflict
                                            "
                                            @click="queueNow(field)"
                                        >
                                            <Save aria-hidden="true" />
                                            Guardar ahora
                                        </Button>
                                    </span>
                                </div>
                            </Field>
                        </div>
                    </CardContent>
                </Card>
            </main>

            <aside class="flex flex-col gap-6 xl:sticky xl:top-4 xl:h-fit">
                <Card v-if="requestedObservations.length > 0">
                    <CardHeader>
                        <CardTitle>Observaciones por responder</CardTitle>
                        <CardDescription>
                            Guarde una respuesta para cada observación. Se
                            fijará al reenviar.
                        </CardDescription>
                    </CardHeader>
                    <CardContent class="space-y-4">
                        <article
                            v-for="observation in requestedObservations"
                            :key="observation.id"
                            class="space-y-3 rounded-md border p-3"
                        >
                            <Badge variant="outline">
                                Revisión {{ observation.revision_number }}
                            </Badge>
                            <p class="text-sm whitespace-pre-wrap">
                                {{ observation.content }}
                            </p>
                            <Form
                                v-bind="
                                    SyllabusController.respondObservation.form({
                                        syllabus: syllabus.id,
                                        observation: observation.id,
                                    })
                                "
                                :options="{ preserveScroll: true }"
                                class="space-y-2"
                                v-slot="{ errors, processing }"
                            >
                                <Field>
                                    <FieldLabel
                                        :for="`response-${observation.id}`"
                                        required
                                    >
                                        Respuesta
                                    </FieldLabel>
                                    <Textarea
                                        :id="`response-${observation.id}`"
                                        name="content"
                                        :model-value="
                                            observation.response?.content ?? ''
                                        "
                                        rows="4"
                                        required
                                    />
                                    <FieldError :errors="[errors.content]" />
                                </Field>
                                <Button
                                    type="submit"
                                    size="sm"
                                    variant="outline"
                                    :disabled="processing || globalSaving"
                                >
                                    <Spinner v-if="processing" />
                                    Guardar respuesta
                                </Button>
                            </Form>
                        </article>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Colaboradores</CardTitle>
                        <CardDescription>
                            El bloqueo optimista evita sobrescribir otra sesión.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ul class="flex flex-col gap-2 text-sm">
                            <li
                                v-for="teacher in syllabus.teachers"
                                :key="teacher"
                            >
                                {{ teacher }}
                            </li>
                        </ul>
                    </CardContent>
                </Card>
            </aside>
        </div>
    </PageFrame>
</template>
