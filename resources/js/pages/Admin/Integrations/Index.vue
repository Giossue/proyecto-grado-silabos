<script setup lang="ts">
import { Head, Link, router, useForm, usePage } from '@inertiajs/vue3';
import {
    AlertTriangle,
    DatabaseZap,
    Eye,
    FlaskConical,
    ShieldCheck,
} from '@lucide/vue';
import { computed, reactive, ref } from 'vue';
import AlertError from '@/components/AlertError.vue';
import FilterToolbar from '@/components/domain/FilterToolbar.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import TableActionsMenu from '@/components/domain/TableActionsMenu.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Field, FieldLabel } from '@/components/ui/field';
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
    index as integrationsIndex,
    store as storeSimulation,
} from '@/routes/admin/integrations';
import { exclude as excludeConflict } from '@/routes/admin/integrations/conflicts';
import type { Paginated } from '@/types/pagination';

type Execution = {
    id: string;
    status: string;
    profile: string;
    mode: string;
    total_items: number;
    valid_items: number;
    rejected_items: number;
    conflicts: number;
    proposed_creates: number;
    proposed_updates: number;
    proposed_unchanged: number;
    error_message: string | null;
    requested_at: string;
    completed_at: string | null;
};

type ImportItem = {
    row: number;
    entity: string;
    name: string | null;
    code: string | null;
    result: string;
    proposed_action: string | null;
    reason: string;
    conflict_id: string | null;
    conflict_status: string | null;
    decision: string | null;
    justification: string | null;
    has_candidate: boolean;
};

const props = defineProps<{
    filters: { q: string; status: string; result: string };
    environment: { enabled: boolean; fixture_only: boolean };
    executions: Paginated<Execution>;
    selected_execution: Execution | null;
    items: Paginated<ImportItem> | null;
}>();

defineOptions({
    layout: {
        breadcrumbs: [
            { title: 'Integración institucional', href: integrationsIndex() },
        ],
    },
});

const page = usePage();
const search = ref(props.filters.q);
const status = ref(props.filters.status || 'all');
const result = ref(props.filters.result || 'all');
const pendingConflict = ref<string | null>(null);
const justifications = reactive<Record<string, string>>({});
const errors = computed((): string[] => {
    const messages: string[] = [];

    for (const message of Object.values(page.props.errors)) {
        if (typeof message === 'string') {
            messages.push(message);
        }
    }

    return messages;
});
const simulationForm = useForm({
    profile: 'baseline',
    idempotency_key: crypto.randomUUID(),
});

const requestSimulation = (): void => {
    const confirmed = window.confirm(
        'Se creará una ejecución versionada con datos sintéticos. El resultado solo será una propuesta para revisión y no modificará catálogos académicos. ¿Continuar?',
    );

    if (!confirmed) {
        return;
    }

    simulationForm.post(storeSimulation.url(), {
        preserveScroll: true,
        onSuccess: () => {
            simulationForm.idempotency_key = crypto.randomUUID();
        },
    });
};

const applyFilters = (): void => {
    router.get(
        integrationsIndex.url(),
        {
            q: search.value || undefined,
            status: status.value === 'all' ? undefined : status.value,
            result: result.value === 'all' ? undefined : result.value,
            run: props.selected_execution?.id,
        },
        { preserveState: true, preserveScroll: true, replace: true },
    );
};

const exclude = (item: ImportItem): void => {
    if (item.conflict_id === null) {
        return;
    }

    const justification = (justifications[item.conflict_id] ?? '').trim();

    if (justification.length < 20) {
        window.alert(
            'Explique la exclusión con al menos 20 caracteres para que la decisión sea auditable.',
        );

        return;
    }

    if (
        !window.confirm(
            'Esta decisión quedará inmutable. La fila no se aplicará en una integración futura. ¿Registrar la exclusión?',
        )
    ) {
        return;
    }

    router.post(
        excludeConflict.url(item.conflict_id),
        { justification },
        {
            preserveScroll: true,
            onStart: () => {
                pendingConflict.value = item.conflict_id;
            },
            onFinish: () => {
                pendingConflict.value = null;
            },
        },
    );
};

const statusLabel = (value: string): string =>
    ({
        pending: 'En cola',
        running: 'En ejecución',
        completed: 'Completada',
        failed: 'Fallida',
    })[value] ?? 'Estado no disponible';

const actionLabel = (value: string | null): string =>
    ({
        create: 'Posible alta',
        update: 'Posible cambio',
        none: 'Sin cambio aparente',
    })[value ?? ''] ?? 'Sin propuesta';

const formatDate = (value: string | null): string =>
    value === null
        ? '—'
        : new Intl.DateTimeFormat('es-EC', {
              dateStyle: 'short',
              timeStyle: 'medium',
          }).format(new Date(value));
</script>

<template>
    <Head title="Integración institucional" />
    <PageFrame
        :icon="DatabaseZap"
        title="Integración institucional"
        description="Clasifique un lote de prueba, identifique conflictos y documente exclusiones antes de definir una conexión institucional real."
    >
        <Alert v-if="environment.fixture_only">
            <FlaskConical />
            <AlertTitle
                >Entorno de demostración con datos sintéticos</AlertTitle
            >
            <AlertDescription>
                Esta función usa un escenario anonimizado incluido en la
                aplicación. No consulta sistemas institucionales, no usa
                credenciales y no aplica altas ni cambios.
            </AlertDescription>
        </Alert>
        <Alert v-else-if="!environment.enabled" variant="destructive">
            <AlertTriangle />
            <AlertTitle>Simulación deshabilitada</AlertTitle>
            <AlertDescription>
                Este entorno no tiene un lector autorizado. La pantalla conserva
                el historial, pero no acepta nuevas ejecuciones.
            </AlertDescription>
        </Alert>
        <AlertError
            v-if="errors.length > 0"
            :errors="errors"
            title="No se pudo completar la acción"
        />

        <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <Card>
                <CardContent class="flex flex-col gap-4">
                    <form @submit.prevent="applyFilters">
                        <FilterToolbar>
                            <template #search>
                                <Field>
                                    <FieldLabel
                                        for="integration-search"
                                        class="sr-only"
                                    >
                                        Buscar ejecuciones
                                    </FieldLabel>
                                    <Input
                                        id="integration-search"
                                        v-model="search"
                                        type="search"
                                        placeholder="Buscar por perfil o estado"
                                    />
                                </Field>
                            </template>
                            <template #filters>
                                <Field>
                                    <FieldLabel
                                        for="integration-status"
                                        class="sr-only"
                                    >
                                        Estado
                                    </FieldLabel>
                                    <Select v-model="status">
                                        <SelectTrigger id="integration-status">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectGroup>
                                                <SelectItem value="all">
                                                    Todos los estados
                                                </SelectItem>
                                                <SelectItem value="pending">
                                                    En cola
                                                </SelectItem>
                                                <SelectItem value="running">
                                                    En ejecución
                                                </SelectItem>
                                                <SelectItem value="completed">
                                                    Completada
                                                </SelectItem>
                                                <SelectItem value="failed">
                                                    Fallida
                                                </SelectItem>
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                </Field>
                                <Field>
                                    <FieldLabel
                                        for="integration-result"
                                        class="sr-only"
                                    >
                                        Resultado de las filas
                                    </FieldLabel>
                                    <Select v-model="result">
                                        <SelectTrigger id="integration-result">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectGroup>
                                                <SelectItem value="all">
                                                    Todas las filas
                                                </SelectItem>
                                                <SelectItem value="conflict">
                                                    Con conflicto
                                                </SelectItem>
                                                <SelectItem value="rejected">
                                                    Rechazadas
                                                </SelectItem>
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                </Field>
                            </template>
                        </FilterToolbar>
                    </form>

                    <div class="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Solicitud</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead>Resumen</TableHead>
                                    <TableHead class="text-right"
                                        >Acciones</TableHead
                                    >
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow
                                    v-for="execution in executions.data"
                                    :key="execution.id"
                                >
                                    <TableCell>
                                        <div class="font-medium">
                                            {{ execution.profile }}
                                        </div>
                                        <div
                                            class="text-xs text-muted-foreground"
                                        >
                                            {{
                                                formatDate(
                                                    execution.requested_at,
                                                )
                                            }}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <span
                                            :class="
                                                execution.status === 'failed'
                                                    ? 'text-destructive'
                                                    : execution.status ===
                                                        'completed'
                                                      ? ''
                                                      : ''
                                            "
                                            >{{
                                                statusLabel(execution.status)
                                            }}</span
                                        >
                                    </TableCell>
                                    <TableCell class="text-sm">
                                        {{ execution.total_items }} fila(s),
                                        {{ execution.conflicts }} conflicto(s)
                                    </TableCell>
                                    <TableCell class="text-right">
                                        <TableActionsMenu
                                            :label="`Acciones para la ejecución del ${formatDate(execution.requested_at)}`"
                                        >
                                            <DropdownMenuItem as-child>
                                                <Link
                                                    :href="
                                                        integrationsIndex({
                                                            query: {
                                                                run: execution.id,
                                                                q:
                                                                    search ||
                                                                    undefined,
                                                                status:
                                                                    status ===
                                                                    'all'
                                                                        ? undefined
                                                                        : status,
                                                                result:
                                                                    result ===
                                                                    'all'
                                                                        ? undefined
                                                                        : result,
                                                            },
                                                        })
                                                    "
                                                >
                                                    <Eye aria-hidden="true" />
                                                    Revisar ejecución
                                                </Link>
                                            </DropdownMenuItem>
                                        </TableActionsMenu>
                                    </TableCell>
                                </TableRow>
                                <TableRow v-if="executions.data.length === 0">
                                    <TableCell
                                        colspan="4"
                                        class="py-8 text-center text-muted-foreground"
                                    >
                                        No hay ejecuciones para este filtro.
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                    <TablePagination
                        :meta="executions"
                        label="Paginación de ejecuciones de simulación"
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Nueva simulación</CardTitle>
                    <CardDescription>
                        El perfil disponible reproduce altas, coincidencias,
                        duplicados y una fila inválida.
                    </CardDescription>
                </CardHeader>
                <CardContent class="flex flex-col gap-4">
                    <div class="rounded-lg border bg-muted/40 p-3 text-sm">
                        <div class="flex items-center gap-2 font-medium">
                            <ShieldCheck class="size-4" aria-hidden="true" />
                            Garantía de no escritura
                        </div>
                        <p class="mt-1 text-muted-foreground">
                            Toda coincidencia se mantiene como conflicto humano.
                            No existe una acción de aplicar.
                        </p>
                    </div>
                    <Button
                        class="w-full"
                        :disabled="
                            !environment.enabled || simulationForm.processing
                        "
                        @click="requestSimulation"
                    >
                        <Spinner v-if="simulationForm.processing" />
                        Ejecutar escenario sintético
                    </Button>
                </CardContent>
            </Card>
        </div>

        <template v-if="selected_execution">
            <Card>
                <CardHeader>
                    <CardTitle>Resultado seleccionado</CardTitle>
                    <CardDescription>
                        {{ selected_execution.mode }} · solicitada
                        {{ formatDate(selected_execution.requested_at) }}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div class="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                        <div class="rounded-lg border p-3">
                            <div class="text-2xl font-semibold">
                                {{ selected_execution.total_items }}
                            </div>
                            <div class="text-xs text-muted-foreground">
                                Filas
                            </div>
                        </div>
                        <div class="rounded-lg border p-3">
                            <div class="text-2xl font-semibold">
                                {{ selected_execution.valid_items }}
                            </div>
                            <div class="text-xs text-muted-foreground">
                                Válidas
                            </div>
                        </div>
                        <div class="rounded-lg border p-3">
                            <div class="text-2xl font-semibold">
                                {{ selected_execution.rejected_items }}
                            </div>
                            <div class="text-xs text-muted-foreground">
                                Rechazadas
                            </div>
                        </div>
                        <div class="rounded-lg border p-3">
                            <div class="text-2xl font-semibold">
                                {{ selected_execution.conflicts }}
                            </div>
                            <div class="text-xs text-muted-foreground">
                                Conflictos
                            </div>
                        </div>
                        <div class="rounded-lg border p-3">
                            <div class="text-2xl font-semibold">
                                {{ selected_execution.proposed_creates }} /
                                {{ selected_execution.proposed_updates }}
                            </div>
                            <div class="text-xs text-muted-foreground">
                                Altas / cambios
                            </div>
                        </div>
                        <div class="rounded-lg border p-3">
                            <div class="text-2xl font-semibold">
                                {{ selected_execution.proposed_unchanged }}
                            </div>
                            <div class="text-xs text-muted-foreground">
                                Sin cambio
                            </div>
                        </div>
                    </div>
                    <Alert
                        v-if="selected_execution.error_message"
                        variant="destructive"
                        class="mt-4"
                    >
                        <AlertTriangle />
                        <AlertTitle>Simulación no completada</AlertTitle>
                        <AlertDescription>{{
                            selected_execution.error_message
                        }}</AlertDescription>
                    </Alert>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Clasificación por fila</CardTitle>
                    <CardDescription>
                        Se muestran únicamente valores normalizados. Excluir es
                        una decisión definitiva y no modifica datos académicos.
                    </CardDescription>
                </CardHeader>
                <CardContent class="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fila</TableHead>
                                <TableHead>Registro normalizado</TableHead>
                                <TableHead>Resultado</TableHead>
                                <TableHead>Motivo</TableHead>
                                <TableHead class="min-w-72"
                                    >Decisión humana</TableHead
                                >
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow
                                v-for="item in items?.data ?? []"
                                :key="item.row"
                            >
                                <TableCell>{{ item.row }}</TableCell>
                                <TableCell>
                                    <div class="font-medium">
                                        {{ item.name ?? item.entity }}
                                    </div>
                                    <div
                                        v-if="item.code"
                                        class="text-xs text-muted-foreground"
                                    >
                                        {{ item.code }}
                                        <span v-if="item.has_candidate">
                                            · candidato local encontrado</span
                                        >
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <span
                                        :class="
                                            item.result === 'rejected'
                                                ? 'text-destructive'
                                                : ''
                                        "
                                        >{{
                                            item.result === 'rejected'
                                                ? 'Rechazada'
                                                : actionLabel(
                                                      item.proposed_action,
                                                  )
                                        }}</span
                                    >
                                </TableCell>
                                <TableCell class="max-w-md text-sm">{{
                                    item.reason
                                }}</TableCell>
                                <TableCell>
                                    <div
                                        v-if="
                                            item.conflict_status === 'resolved'
                                        "
                                        class="flex flex-col gap-1 text-sm"
                                    >
                                        Excluida
                                        <p class="text-muted-foreground">
                                            {{ item.justification }}
                                        </p>
                                    </div>
                                    <div
                                        v-else-if="item.conflict_id"
                                        class="flex flex-col gap-2"
                                    >
                                        <label
                                            class="text-sm font-medium"
                                            :for="`justification-${item.row}`"
                                            >Justificación para excluir</label
                                        >
                                        <Textarea
                                            :id="`justification-${item.row}`"
                                            v-model="
                                                justifications[item.conflict_id]
                                            "
                                            minlength="20"
                                            maxlength="2000"
                                            placeholder="Explique por qué esta fila no debe considerarse…"
                                        />
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            :disabled="
                                                pendingConflict ===
                                                item.conflict_id
                                            "
                                            @click="exclude(item)"
                                        >
                                            <Spinner
                                                v-if="
                                                    pendingConflict ===
                                                    item.conflict_id
                                                "
                                            />
                                            Excluir fila
                                        </Button>
                                    </div>
                                    <span
                                        v-else
                                        class="text-sm text-muted-foreground"
                                        >No requiere decisión</span
                                    >
                                </TableCell>
                            </TableRow>
                            <TableRow v-if="(items?.data.length ?? 0) === 0">
                                <TableCell
                                    colspan="5"
                                    class="py-8 text-center text-muted-foreground"
                                >
                                    La ejecución todavía no tiene filas para
                                    este filtro.
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                    <TablePagination
                        v-if="items"
                        :meta="items"
                        label="Paginación de filas normalizadas"
                    />
                </CardContent>
            </Card>
        </template>
    </PageFrame>
</template>
