<script setup lang="ts">
import { Form, Head, Link } from '@inertiajs/vue3';
import { LockKeyhole, RotateCcw, ShieldCheck, Undo2 } from '@lucide/vue';
import { computed, ref } from 'vue';
import ReviewController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/ReviewController';
import PageFrame from '@/components/domain/PageFrame.vue';
import IdentificationCard from '@/components/domain/syllabus/IdentificationCard.vue';
import type { IdentificationCell } from '@/components/domain/syllabus/IdentificationCard.vue';
import ReviewObservationSheet from '@/components/domain/syllabus/ReviewObservationSheet.vue';
import SyllabusResetDialog from '@/components/domain/syllabus/SyllabusResetDialog.vue';
import SyllabusTableView from '@/components/domain/syllabus/SyllabusTableView.vue';
import TeacherTransferSheet from '@/components/domain/syllabus/TeacherTransferSheet.vue';
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
    FieldError,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import type { TableLayout, TableRowData } from '@/lib/tableLayout';
import { show as documentsShow } from '@/routes/documents';
import { index as reviewsIndex } from '@/routes/reviews';

type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue };

type SnapshotField = {
    key: string;
    label: string;
    type: string;
    inherited: boolean;
    value: JsonValue;
    rows: { id: string; position: number; data: JsonValue }[];
};

type SnapshotSection = {
    key: string;
    title: string;
    blocks: {
        key: string;
        title: string;
        content_type?: string;
        /** Esquema de tabla copiado en la revisión (I-34); ausente en copias antiguas. */
        table?: TableLayout | null;
        fields: SnapshotField[];
    }[];
};

type Observation = {
    id: string;
    revision_number: number;
    section_key: string | null;
    field_key: string | null;
    content: string;
    state: string;
    requested: boolean;
    can_verify: boolean;
    created_by: string;
    observado_en: string;
    response: {
        content: string;
        responded_by: string;
        responded_at: string;
        revision_number: number | null;
    } | null;
};

type HistoryItem = {
    id: string;
    number: number;
    submitted_at: string;
    submitted_by: string;
    approved_at: string | null;
};

const props = defineProps<{
    syllabus: {
        id: string;
        subject: string;
        code: string;
        period: string;
        state: string;
        teachers: string[];
    };
    revision: {
        id: string;
        number: number;
        submitted_at: string;
        submitted_by: string;
        snapshot: { schema_version: number; sections: SnapshotSection[] };
        /** Ficha de identificación en cuadrícula; nula en copias antiguas. */
        identification: IdentificationCell[][] | null;
        is_current: boolean;
    };
    history: HistoryItem[];
    observations: Observation[];
    correction_request: {
        justification: string;
        requested_at: string;
    } | null;
    reopening: {
        cause: string;
        reopened_at: string;
        reopened_by: string;
    } | null;
    transfer: {
        allowed: boolean;
        current: { id: string; name: string }[];
        candidates: { id: string; name: string }[];
    };
    reset: { allowed: boolean };
}>();

defineOptions({
    layout: { breadcrumbs: [{ title: 'Revisión', href: reviewsIndex() }] },
});

const selectedObservationIds = ref<string[]>([]);
const approvalKey = crypto.randomUUID();
const reopeningKey = crypto.randomUUID();

const openCurrentObservations = computed(() =>
    props.observations.filter(
        (observation) =>
            observation.revision_number === props.revision.number &&
            observation.state === 'abierta',
    ),
);
const unresolvedCount = computed(
    () =>
        props.observations.filter(
            (observation) => observation.state !== 'verificada',
        ).length,
);
const canReviewCurrent = computed(
    () => props.revision.is_current && props.syllabus.state === 'en_revision',
);

const toggleObservation = (
    id: string,
    checked: boolean | 'indeterminate',
): void => {
    if (typeof checked !== 'boolean') {
        return;
    }

    const values = new Set(selectedObservationIds.value);

    if (checked) {
        values.add(id);
    } else {
        values.delete(id);
    }

    selectedObservationIds.value = [...values];
};

/** Filas de una tabla: solo las que traen un objeto de celdas. */
const tableRows = (
    field: SnapshotField,
): { id: string | null; data: TableRowData }[] =>
    field.rows
        .filter(
            (row) =>
                typeof row.data === 'object' &&
                row.data !== null &&
                !Array.isArray(row.data),
        )
        .map((row) => ({ id: row.id, data: row.data as TableRowData }));

const formatValue = (value: JsonValue): string => {
    if (value === null || value === '') {
        return 'Sin contenido';
    }

    if (typeof value === 'boolean') {
        return value ? 'Sí' : 'No';
    }

    if (typeof value === 'object') {
        return JSON.stringify(value, null, 2);
    }

    return String(value);
};

const stateLabel = (value: string): string =>
    ({
        en_revision: 'En revisión',
        correccion_solicitada: 'Corrección solicitada',
        aprobado: 'Aprobado',
    })[value] ?? 'Estado no disponible';

const observationState = (value: string): string =>
    ({
        abierta: 'Abierta',
        respondida: 'Respondida',
        verificada: 'Verificada',
    })[value] ?? 'Estado no disponible';
</script>

<template>
    <Head :title="`Revisión ${revision.number} · ${syllabus.subject}`" />
    <PageFrame
        :title="syllabus.subject"
        :description="`${syllabus.code} · ${syllabus.period} · ${syllabus.teachers.join(', ')}`"
    >
        <template #eyebrow>
            <Button as-child variant="link" class="h-auto px-0">
                <Link :href="reviewsIndex()">← Volver a la cola</Link>
            </Button>
        </template>
        <template #meta>
            <Badge variant="secondary">Revisión {{ revision.number }}</Badge>
            <Badge variant="outline">
                {{ stateLabel(syllabus.state) }}
            </Badge>
            <span class="text-sm text-muted-foreground">
                Enviada por {{ revision.submitted_by }} ·
                {{ new Date(revision.submitted_at).toLocaleString('es-EC') }}
            </span>
        </template>
        <template #actions>
            <SyllabusResetDialog
                v-if="reset.allowed && revision.is_current"
                :syllabus-id="syllabus.id"
                :subject="syllabus.subject"
            />
            <TeacherTransferSheet
                v-if="transfer.allowed && transfer.current.length > 0"
                :syllabus-id="syllabus.id"
                :state="syllabus.state"
                :current="transfer.current"
                :candidates="transfer.candidates"
            />
        </template>

        <Alert v-if="!revision.is_current">
            <LockKeyhole aria-hidden="true" />
            <AlertTitle>Está consultando una revisión histórica</AlertTitle>
            <AlertDescription>
                Esta revisión se conserva tal como fue enviada. Las acciones del
                flujo solo están disponibles en la revisión vigente.
            </AlertDescription>
        </Alert>

        <Alert v-if="correction_request">
            <Undo2 aria-hidden="true" />
            <AlertTitle>Corrección solicitada en esta revisión</AlertTitle>
            <AlertDescription>
                {{ correction_request.justification }}
            </AlertDescription>
        </Alert>

        <Alert v-if="reopening">
            <RotateCcw aria-hidden="true" />
            <AlertTitle>El expediente tuvo una reapertura</AlertTitle>
            <AlertDescription>
                {{ reopening.cause }} · {{ reopening.reopened_by }} ·
                {{ new Date(reopening.reopened_at).toLocaleString('es-EC') }}.
                La aprobación anterior se conserva.
            </AlertDescription>
        </Alert>

        <div class="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(22rem,1fr)]">
            <main class="flex min-w-0 flex-col gap-6">
                <Card
                    v-for="section in revision.snapshot.sections"
                    :id="`section-${section.key}`"
                    :key="section.key"
                >
                    <CardHeader>
                        <CardTitle>{{ section.title }}</CardTitle>
                        <CardDescription>
                            Contenido exacto enviado en la revisión
                            {{ revision.number }}.
                        </CardDescription>
                    </CardHeader>
                    <CardContent class="space-y-6">
                        <section
                            v-for="block in section.blocks"
                            :key="block.key"
                            class="space-y-4"
                        >
                            <h3
                                v-if="section.blocks.length > 1"
                                class="font-medium"
                            >
                                {{ block.title }}
                            </h3>
                            <dl class="grid gap-4">
                                <div
                                    v-for="field in block.fields"
                                    :key="field.key"
                                    class="rounded-md border p-4"
                                >
                                    <dt
                                        class="flex flex-wrap gap-2 font-medium"
                                    >
                                        {{ field.label }}
                                        <Badge
                                            v-if="field.inherited"
                                            variant="outline"
                                        >
                                            Institucional
                                        </Badge>
                                    </dt>
                                    <dd
                                        v-if="
                                            block.content_type ===
                                                'institutional' &&
                                            field.inherited &&
                                            revision.identification
                                        "
                                        class="mt-3"
                                    >
                                        <IdentificationCard
                                            :grid="revision.identification"
                                        />
                                    </dd>
                                    <dd
                                        v-else-if="field.rows.length === 0"
                                        class="mt-2 text-sm whitespace-pre-wrap"
                                    >
                                        {{ formatValue(field.value) }}
                                    </dd>
                                    <dd v-else-if="block.table" class="mt-3">
                                        <SyllabusTableView
                                            :layout="block.table"
                                            :rows="tableRows(field)"
                                        />
                                    </dd>
                                    <dd v-else class="mt-3 space-y-2">
                                        <div
                                            v-for="(row, index) in field.rows"
                                            :key="row.id"
                                            class="rounded bg-muted p-3 text-sm whitespace-pre-wrap"
                                        >
                                            <span class="font-medium">
                                                Fila {{ index + 1 }}:
                                            </span>
                                            {{ formatValue(row.data) }}
                                        </div>
                                    </dd>
                                </div>
                            </dl>
                        </section>
                    </CardContent>
                </Card>
            </main>

            <aside class="flex min-w-0 flex-col gap-6">
                <ReviewObservationSheet
                    v-if="canReviewCurrent"
                    :revision-id="revision.id"
                    :sections="revision.snapshot.sections"
                />

                <Card>
                    <CardHeader>
                        <CardTitle>Observaciones</CardTitle>
                        <CardDescription>
                            {{ unresolvedCount }} pendiente(s) en todo el
                            historial.
                        </CardDescription>
                    </CardHeader>
                    <CardContent class="space-y-4">
                        <article
                            v-for="observation in observations"
                            :key="observation.id"
                            class="space-y-3 rounded-md border p-4"
                        >
                            <div class="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">
                                    Rev. {{ observation.revision_number }}
                                </Badge>
                                <Badge
                                    :variant="
                                        observation.state === 'verificada'
                                            ? 'secondary'
                                            : 'destructive'
                                    "
                                >
                                    {{ observationState(observation.state) }}
                                </Badge>
                                <Badge
                                    v-if="observation.requested"
                                    variant="outline"
                                >
                                    Solicitada
                                </Badge>
                            </div>
                            <p class="text-sm whitespace-pre-wrap">
                                {{ observation.content }}
                            </p>
                            <p class="text-xs text-muted-foreground">
                                {{ observation.created_by }} ·
                                {{
                                    new Date(
                                        observation.observado_en,
                                    ).toLocaleString('es-EC')
                                }}
                            </p>
                            <div
                                v-if="observation.response"
                                class="rounded bg-muted p-3 text-sm"
                            >
                                <div class="font-medium">
                                    Respuesta del docente
                                    <span
                                        v-if="
                                            observation.response.revision_number
                                        "
                                    >
                                        · revisión
                                        {{
                                            observation.response.revision_number
                                        }}
                                    </span>
                                </div>
                                <p class="mt-1 whitespace-pre-wrap">
                                    {{ observation.response.content }}
                                </p>
                            </div>
                            <Form
                                v-if="observation.can_verify"
                                v-bind="
                                    ReviewController.verifyObservation.form(
                                        observation.id,
                                    )
                                "
                                v-slot="{ processing }"
                            >
                                <Button
                                    type="submit"
                                    size="sm"
                                    variant="outline"
                                    :disabled="processing"
                                >
                                    <Spinner v-if="processing" />
                                    Marcar verificada
                                </Button>
                            </Form>
                        </article>
                        <p
                            v-if="observations.length === 0"
                            class="text-sm text-muted-foreground"
                        >
                            Aún no hay observaciones.
                        </p>
                    </CardContent>
                </Card>

                <Card
                    v-if="
                        canReviewCurrent && openCurrentObservations.length > 0
                    "
                >
                    <CardHeader>
                        <CardTitle>Solicitar corrección</CardTitle>
                        <CardDescription>
                            Seleccione las observaciones que el docente debe
                            responder.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Form
                            v-bind="
                                ReviewController.requestCorrection.form(
                                    revision.id,
                                )
                            "
                            class="space-y-4"
                            v-slot="{ errors, processing }"
                        >
                            <input
                                v-for="id in selectedObservationIds"
                                :key="id"
                                type="hidden"
                                name="observation_ids[]"
                                :value="id"
                            />
                            <FieldSet aria-required="true" class="gap-3">
                                <FieldLegend variant="label" required>
                                    Observaciones por corregir
                                </FieldLegend>
                                <label
                                    v-for="observation in openCurrentObservations"
                                    :key="observation.id"
                                    :for="`correction-observation-${observation.id}`"
                                    class="flex items-start gap-3 rounded-md border p-3 text-sm"
                                >
                                    <Checkbox
                                        :id="`correction-observation-${observation.id}`"
                                        :model-value="
                                            selectedObservationIds.includes(
                                                observation.id,
                                            )
                                        "
                                        @update:model-value="
                                            toggleObservation(
                                                observation.id,
                                                $event,
                                            )
                                        "
                                    />
                                    <span>{{ observation.content }}</span>
                                </label>
                            </FieldSet>
                            <Field>
                                <FieldLabel
                                    for="correction-justification"
                                    required
                                >
                                    Justificación para el docente
                                </FieldLabel>
                                <Textarea
                                    id="correction-justification"
                                    name="justification"
                                    rows="4"
                                    required
                                />
                                <FieldError
                                    :errors="
                                        [
                                            errors.observation_ids,
                                            errors.justification,
                                        ].filter(Boolean)
                                    "
                                />
                            </Field>
                            <Button
                                type="submit"
                                variant="destructive"
                                :disabled="
                                    processing ||
                                    selectedObservationIds.length === 0
                                "
                            >
                                <Spinner v-if="processing" />
                                <Undo2 v-else aria-hidden="true" />
                                Solicitar corrección
                            </Button>
                        </Form>
                    </CardContent>
                </Card>

                <Card v-if="canReviewCurrent">
                    <CardHeader>
                        <CardTitle>Aprobar revisión</CardTitle>
                        <CardDescription>
                            La aprobación quedará vinculada exclusivamente a la
                            revisión {{ revision.number }}.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Form
                            v-bind="ReviewController.approve.form(revision.id)"
                            class="space-y-3"
                            v-slot="{ errors, processing }"
                        >
                            <input
                                type="hidden"
                                name="idempotency_key"
                                :value="approvalKey"
                            />
                            <FieldError
                                :errors="
                                    [
                                        errors.observations,
                                        errors.revision,
                                    ].filter(Boolean)
                                "
                            />
                            <Button
                                type="submit"
                                :disabled="processing || unresolvedCount > 0"
                            >
                                <Spinner v-if="processing" />
                                <ShieldCheck v-else aria-hidden="true" />
                                Aprobar revisión {{ revision.number }}
                            </Button>
                            <p
                                v-if="unresolvedCount > 0"
                                class="text-sm text-destructive"
                            >
                                Verifique todas las observaciones antes de
                                aprobar.
                            </p>
                        </Form>
                    </CardContent>
                </Card>

                <Card
                    v-if="revision.is_current && syllabus.state === 'aprobado'"
                >
                    <CardHeader>
                        <CardTitle>Reabrir aprobado</CardTitle>
                        <CardDescription>
                            Conserva esta aprobación y crea una nueva línea de
                            corrección para el docente.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Form
                            v-bind="ReviewController.reopen.form(syllabus.id)"
                            class="space-y-4"
                            v-slot="{ errors, processing }"
                        >
                            <input
                                type="hidden"
                                name="idempotency_key"
                                :value="reopeningKey"
                            />
                            <Field>
                                <FieldLabel for="reopening-cause" required>
                                    Causa de reapertura
                                </FieldLabel>
                                <Textarea
                                    id="reopening-cause"
                                    name="cause"
                                    rows="4"
                                    required
                                />
                                <FieldError :errors="[errors.cause]" />
                            </Field>
                            <Button
                                type="submit"
                                variant="destructive"
                                :disabled="processing"
                            >
                                <Spinner v-if="processing" />
                                <RotateCcw v-else aria-hidden="true" />
                                Reabrir conservando la aprobación
                            </Button>
                        </Form>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Historial de revisiones</CardTitle>
                        <CardDescription>
                            Consulte o compare revisiones enviadas.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ol class="space-y-3">
                            <li
                                v-for="(item, index) in history"
                                :key="item.id"
                                class="rounded-md border p-3 text-sm"
                            >
                                <div
                                    class="flex items-center justify-between gap-3"
                                >
                                    <Button
                                        as-child
                                        variant="link"
                                        class="h-auto p-0"
                                    >
                                        <Link
                                            :href="
                                                ReviewController.show(item.id)
                                            "
                                        >
                                            Revisión {{ item.number }}
                                        </Link>
                                    </Button>
                                    <Badge
                                        v-if="item.approved_at"
                                        variant="secondary"
                                    >
                                        Aprobada
                                    </Badge>
                                </div>
                                <div class="text-muted-foreground">
                                    {{ item.submitted_by }} ·
                                    {{
                                        new Date(
                                            item.submitted_at,
                                        ).toLocaleDateString('es-EC')
                                    }}
                                </div>
                                <div class="mt-2 flex flex-wrap gap-2">
                                    <Button
                                        v-if="item.approved_at"
                                        as-child
                                        size="sm"
                                        variant="outline"
                                    >
                                        <Link :href="documentsShow(item.id)">
                                            Documentos
                                        </Link>
                                    </Button>
                                    <Button
                                        v-if="index > 0"
                                        as-child
                                        size="sm"
                                        variant="outline"
                                    >
                                        <Link
                                            :href="
                                                ReviewController.compare({
                                                    before: history[index - 1]
                                                        .id,
                                                    after: item.id,
                                                })
                                            "
                                        >
                                            Comparar con la anterior
                                        </Link>
                                    </Button>
                                </div>
                            </li>
                        </ol>
                    </CardContent>
                </Card>
            </aside>
        </div>
    </PageFrame>
</template>
