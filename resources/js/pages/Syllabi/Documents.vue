<script setup lang="ts">
import { Head, Link, router, useForm, usePage } from '@inertiajs/vue3';
import {
    ArrowLeft,
    Download,
    FileArchive,
    FileText,
    ShieldCheck,
} from '@lucide/vue';
import { computed, onMounted, onUnmounted } from 'vue';
import ClientFilterBar from '@/components/domain/ClientFilterBar.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import TableActionsMenu from '@/components/domain/TableActionsMenu.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Field, FieldLabel } from '@/components/ui/field';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
    Table,
    TableBody,
    TableCell,
    TableEmpty,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { useClientFilter } from '@/composables/useClientFilter';
import { useClientPagination } from '@/composables/useClientPagination';
import {
    show as documentShow,
    store as documentStore,
} from '@/routes/documents';
import { download } from '@/routes/exports';
import { show as reviewShow } from '@/routes/reviews';
import { show as syllabusShow } from '@/routes/syllabi';

type Artifact = {
    id: string;
    estado: string;
    requested_at: string;
    completed_at: string | null;
    renderer_label: string;
    execution: {
        estado: string;
        progreso: number;
        mensaje_error: string | null;
    } | null;
    files: {
        docx_size: number | null;
        pdf_size: number | null;
    } | null;
};

const props = defineProps<{
    syllabus: {
        id: string;
        subject: string;
        code: string;
        period: string;
    };
    revision: {
        id: string;
        number: number;
        approved_at: string;
        approved_by: string;
    };
    artifacts: Artifact[];
}>();

defineOptions({
    layout: { breadcrumbs: [{ title: 'Documentos', href: '#' }] },
});

const page = usePage();
const activeRole = computed(() =>
    page.props.auth.roles.find(
        (role) => role.id === page.props.auth.active_role_id,
    ),
);
const backHref = computed(() =>
    activeRole.value?.role === 'coordinador'
        ? reviewShow(props.revision.id)
        : syllabusShow(props.syllabus.id),
);
const hasPending = computed(() =>
    props.artifacts.some((artifact) =>
        ['pendiente', 'en_ejecucion'].includes(artifact.estado),
    ),
);
const filter = useClientFilter(
    () => props.artifacts,
    (item) => [item.estado, item.renderer_label],
    {
        // Un artefacto no se archiva: o está listo para descargar o sigue en proceso.
        estado: {
            matches: (item, value) =>
                value === 'ready'
                    ? item.estado === 'completado'
                    : item.estado !== 'completado',
        },
    },
);

const {
    items: artifactPage,
    meta: artifactMeta,
    setPage: setArtifactPage,
} = useClientPagination(() => filter.items.value);
const form = useForm({ idempotency_key: crypto.randomUUID() });
let refreshTimer: number | undefined;

const requestExport = (): void => {
    form.post(documentStore.url(props.revision.id), {
        preserveScroll: true,
        onSuccess: () => {
            form.idempotency_key = crypto.randomUUID();
        },
    });
};

const statusLabel = (status: string): string =>
    ({
        pendiente: 'En cola',
        en_ejecucion: 'Generando',
        completado: 'Disponible',
        fallido: 'Fallida',
    })[status] ?? 'Estado no disponible';

const formatDate = (value: string | null): string =>
    value === null
        ? '—'
        : new Intl.DateTimeFormat('es-EC', {
              dateStyle: 'medium',
              timeStyle: 'short',
          }).format(new Date(value));

const formatBytes = (value: number | null): string => {
    if (value === null) {
        return '—';
    }

    if (value < 1024) {
        return `${value} B`;
    }

    if (value < 1024 * 1024) {
        return `${(value / 1024).toFixed(1)} KB`;
    }

    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

onMounted(() => {
    refreshTimer = window.setInterval(() => {
        if (hasPending.value) {
            router.reload({ only: ['artifacts'] });
        }
    }, 4000);
});

onUnmounted(() => {
    if (refreshTimer !== undefined) {
        window.clearInterval(refreshTimer);
    }
});
</script>

<template>
    <Head :title="`Documentos · ${syllabus.subject}`" />
    <PageFrame
        title="Documentos aprobados"
        :description="`${syllabus.subject} · ${syllabus.code} · revisión ${revision.number}`"
    >
        <template #eyebrow>
            <Button as-child variant="link" class="h-auto px-0">
                <Link :href="backHref">
                    <ArrowLeft aria-hidden="true" />
                    Volver al expediente
                </Link>
            </Button>
        </template>
        <template #actions>
            <Button
                class="max-sm:size-14 max-sm:rounded-full max-sm:p-0"
                :disabled="form.processing"
                aria-label="Generar DOCX y PDF"
                @click="requestExport"
            >
                <Spinner v-if="form.processing" data-icon="inline-start" />
                <FileArchive
                    v-else
                    data-icon="inline-start"
                    aria-hidden="true"
                />
                <span class="max-sm:hidden">Generar DOCX y PDF</span>
            </Button>
        </template>

        <Alert>
            <ShieldCheck aria-hidden="true" />
            <AlertTitle>Revisión aprobada</AlertTitle>
            <AlertDescription>
                Ambos archivos se generan desde la revisión
                {{ revision.number }} aprobada por {{ revision.approved_by }} el
                {{ formatDate(revision.approved_at) }}. La descarga vuelve a
                comprobar su autorización.
            </AlertDescription>
        </Alert>

        <Alert variant="destructive">
            <FileText aria-hidden="true" />
            <AlertTitle>Formato institucional en revisión</AlertTitle>
            <AlertDescription>
                Esta exportación está disponible para revisión. La validación
                del formato institucional continúa en curso.
            </AlertDescription>
        </Alert>

        <Card>
            <CardContent class="flex flex-col gap-4">
                <div class="overflow-x-auto" aria-live="polite">
                    <ClientFilterBar
                        :filter="filter"
                        input-id="documents-search"
                        label="Buscar documento"
                        placeholder="Buscar por asignatura, formato o estado"
                    >
                        <template #filters>
                            <Field>
                                <FieldLabel
                                    for="documents-search-state"
                                    class="sr-only"
                                >
                                    Estado
                                </FieldLabel>
                                <Select v-model="filter.values.estado.value">
                                    <SelectTrigger id="documents-search-state">
                                        <SelectValue
                                            placeholder="Todos los estados"
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem value="all"
                                                >Todos los estados</SelectItem
                                            >
                                            <SelectItem value="ready"
                                                >Listos</SelectItem
                                            >
                                            <SelectItem value="pending"
                                                >En proceso</SelectItem
                                            >
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>
                        </template>
                    </ClientFilterBar>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Solicitud</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead>Formato</TableHead>
                                <TableHead class="text-right"
                                    >Acciones</TableHead
                                >
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableEmpty
                                v-if="artifacts.length === 0"
                                :colspan="4"
                            >
                                Todavía no se han solicitado documentos para
                                esta revisión.
                            </TableEmpty>
                            <TableRow
                                v-for="artifact in artifactPage"
                                :key="artifact.id"
                            >
                                <TableCell>
                                    <p class="font-medium">
                                        {{ formatDate(artifact.requested_at) }}
                                    </p>
                                    <p
                                        v-if="artifact.completed_at"
                                        class="text-xs text-muted-foreground"
                                    >
                                        Completada
                                        {{ formatDate(artifact.completed_at) }}
                                    </p>
                                </TableCell>
                                <TableCell>
                                    <span
                                        :class="
                                            artifact.estado === 'fallido'
                                                ? 'text-destructive'
                                                : artifact.estado ===
                                                    'completado'
                                                  ? ''
                                                  : ''
                                        "
                                        >{{
                                            statusLabel(artifact.estado)
                                        }}</span
                                    >
                                    <p
                                        v-if="
                                            artifact.execution &&
                                            [
                                                'pendiente',
                                                'en_ejecucion',
                                            ].includes(artifact.estado)
                                        "
                                        class="mt-1 text-xs text-muted-foreground"
                                    >
                                        Progreso
                                        {{ artifact.execution.progreso }}%
                                    </p>
                                    <p
                                        v-if="artifact.execution?.mensaje_error"
                                        class="mt-1 max-w-sm text-sm text-destructive"
                                    >
                                        {{ artifact.execution.mensaje_error }}
                                    </p>
                                </TableCell>
                                <TableCell class="text-sm">
                                    {{ artifact.renderer_label }}
                                </TableCell>
                                <TableCell class="text-right">
                                    <TableActionsMenu
                                        :label="`Acciones para la solicitud del ${formatDate(artifact.requested_at)}`"
                                    >
                                        <template v-if="artifact.files">
                                            <DropdownMenuItem as-child>
                                                <a
                                                    :href="
                                                        download.url({
                                                            artifact:
                                                                artifact.id,
                                                            format: 'docx',
                                                        })
                                                    "
                                                >
                                                    <Download
                                                        aria-hidden="true"
                                                    />
                                                    Descargar DOCX ·
                                                    {{
                                                        formatBytes(
                                                            artifact.files
                                                                .docx_size,
                                                        )
                                                    }}
                                                </a>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem as-child>
                                                <a
                                                    :href="
                                                        download.url({
                                                            artifact:
                                                                artifact.id,
                                                            format: 'pdf',
                                                        })
                                                    "
                                                >
                                                    <Download
                                                        aria-hidden="true"
                                                    />
                                                    Descargar PDF ·
                                                    {{
                                                        formatBytes(
                                                            artifact.files
                                                                .pdf_size,
                                                        )
                                                    }}
                                                </a>
                                            </DropdownMenuItem>
                                        </template>
                                        <DropdownMenuItem v-else disabled>
                                            Archivos aún no disponibles
                                        </DropdownMenuItem>
                                    </TableActionsMenu>
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
                <TablePagination
                    :meta="artifactMeta"
                    mode="client"
                    label="Paginación de solicitudes de generación"
                    @update:page="setArtifactPage"
                />
            </CardContent>
        </Card>

        <Link :href="documentShow(revision.id)" class="sr-only">
            Actualizar estado documental
        </Link>
    </PageFrame>
</template>
