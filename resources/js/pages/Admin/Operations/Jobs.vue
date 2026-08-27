<script setup lang="ts">
import { Head, router } from '@inertiajs/vue3';
import { ListRestart, RotateCw } from '@lucide/vue';
import { ref } from 'vue';
import FilterToolbar from '@/components/domain/FilterToolbar.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import TableActionsMenu from '@/components/domain/TableActionsMenu.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
import { Card, CardContent } from '@/components/ui/card';
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
import { index as jobsIndex, retry as retryJob } from '@/routes/admin/jobs';
import type { Paginated } from '@/types/pagination';

type Option = { value: string; label: string };

type Execution = {
    id: string;
    type: string;
    queue: string;
    status: string;
    attempts: number;
    max_attempts: number;
    progress: number;
    error_message: string | null;
    created_at: string | null;
    started_at: string | null;
    finished_at: string | null;
    retryable: boolean;
};

const props = defineProps<{
    filters: { q: string; status: string; type: string; queue: string };
    type_options: Option[];
    queue_options: Option[];
    executions: Paginated<Execution>;
}>();

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Procesos', href: jobsIndex() }],
    },
});

const search = ref(props.filters.q);
const status = ref(props.filters.status || 'all');
const type = ref(props.filters.type || 'all');
const queue = ref(props.filters.queue || 'all');
const retryingId = ref<string | null>(null);

const applyFilters = (): void => {
    router.get(
        jobsIndex.url(),
        {
            q: search.value || undefined,
            status: status.value === 'all' ? undefined : status.value,
            type: type.value === 'all' ? undefined : type.value,
            queue: queue.value === 'all' ? undefined : queue.value,
        },
        { preserveState: true, preserveScroll: true, replace: true },
    );
};

const retry = (execution: Execution): void => {
    const confirmed = window.confirm(
        `Se volverá a encolar “${execution.type}”. La operación conserva el conteo y la auditoría de intentos anteriores. ¿Continuar?`,
    );

    if (!confirmed) {
        return;
    }

    router.post(
        retryJob.url(execution.id),
        {},
        {
            preserveScroll: true,
            onStart: () => {
                retryingId.value = execution.id;
            },
            onFinish: () => {
                retryingId.value = null;
            },
        },
    );
};

const statusLabel = (value: string): string =>
    ({
        pending: 'En cola',
        running: 'En ejecución',
        completed: 'Completado',
        failed: 'Fallido',
    })[value] ?? value;

const formatDate = (value: string | null): string =>
    value === null
        ? '—'
        : new Intl.DateTimeFormat('es-EC', {
              dateStyle: 'short',
              timeStyle: 'medium',
          }).format(new Date(value));
</script>

<template>
    <Head title="Procesos" />
    <PageFrame
        :icon="ListRestart"
        title="Procesos"
        description="Lo que el sistema hace por detrás: correos, documentos y análisis. Aquí se ve qué terminó y qué falló."
    >
        <Card>
            <CardContent class="flex flex-col gap-4">
                <form @submit.prevent="applyFilters">
                    <FilterToolbar>
                        <template #search>
                            <Field>
                                <FieldLabel for="jobs-search" class="sr-only">
                                    Buscar procesos
                                </FieldLabel>
                                <Input
                                    id="jobs-search"
                                    v-model="search"
                                    type="search"
                                    placeholder="Buscar por proceso o cola"
                                />
                            </Field>
                        </template>
                        <template #filters>
                            <Field>
                                <FieldLabel for="jobs-status" class="sr-only">
                                    Estado
                                </FieldLabel>
                                <Select v-model="status">
                                    <SelectTrigger id="jobs-status">
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
                                                Completado
                                            </SelectItem>
                                            <SelectItem value="failed">
                                                Fallido
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field>
                                <FieldLabel for="jobs-type" class="sr-only">
                                    Tipo
                                </FieldLabel>
                                <Select v-model="type">
                                    <SelectTrigger id="jobs-type">
                                        <SelectValue
                                            placeholder="Todos los tipos"
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem value="all">
                                                Todos los tipos
                                            </SelectItem>
                                            <SelectItem
                                                v-for="option in type_options"
                                                :key="option.value"
                                                :value="option.value"
                                            >
                                                {{ option.label }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field>
                                <FieldLabel for="jobs-queue" class="sr-only">
                                    Cola
                                </FieldLabel>
                                <Select v-model="queue">
                                    <SelectTrigger id="jobs-queue">
                                        <SelectValue
                                            placeholder="Todas las colas"
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem value="all">
                                                Todas las colas
                                            </SelectItem>
                                            <SelectItem
                                                v-for="option in queue_options"
                                                :key="option.value"
                                                :value="option.value"
                                            >
                                                {{ option.label }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>
                        </template>
                    </FilterToolbar>
                </form>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Proceso</TableHead>
                            <TableHead>Cola</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead>Intentos</TableHead>
                            <TableHead>Inicio / fin</TableHead>
                            <TableHead>Motivo del fallo</TableHead>
                            <TableHead class="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow
                            v-for="execution in executions.data"
                            :key="execution.id"
                        >
                            <TableCell class="font-medium">{{
                                execution.type
                            }}</TableCell>
                            <TableCell>{{ execution.queue }}</TableCell>
                            <TableCell>
                                <span
                                    :class="
                                        execution.status === 'failed'
                                            ? 'text-destructive'
                                            : execution.status === 'completed'
                                              ? ''
                                              : ''
                                    "
                                    >{{ statusLabel(execution.status) }}</span
                                >
                                <div
                                    v-if="
                                        ['pending', 'running'].includes(
                                            execution.status,
                                        )
                                    "
                                    class="mt-1 text-xs text-muted-foreground"
                                >
                                    {{ execution.progress }} %
                                </div>
                            </TableCell>
                            <TableCell>
                                {{ execution.attempts }} acumulado(s)
                                <div class="text-xs text-muted-foreground">
                                    máximo {{ execution.max_attempts }} por
                                    ciclo
                                </div>
                            </TableCell>
                            <TableCell class="text-xs">
                                <div>
                                    Inicio:
                                    {{ formatDate(execution.started_at) }}
                                </div>
                                <div>
                                    Fin: {{ formatDate(execution.finished_at) }}
                                </div>
                            </TableCell>
                            <TableCell class="max-w-sm text-sm">
                                {{ execution.error_message ?? '—' }}
                            </TableCell>
                            <TableCell class="text-right">
                                <TableActionsMenu
                                    :label="`Acciones para ${execution.type}`"
                                >
                                    <DropdownMenuItem
                                        v-if="execution.retryable"
                                        :disabled="retryingId !== null"
                                        @select="retry(execution)"
                                    >
                                        <Spinner
                                            v-if="retryingId === execution.id"
                                        />
                                        <RotateCw v-else aria-hidden="true" />
                                        Reintentar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem v-else disabled>
                                        No hay acciones disponibles
                                    </DropdownMenuItem>
                                </TableActionsMenu>
                            </TableCell>
                        </TableRow>
                        <TableRow v-if="executions.data.length === 0">
                            <TableCell
                                colspan="7"
                                class="py-10 text-center text-muted-foreground"
                            >
                                No hay procesos para los filtros actuales.
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
                <TablePagination
                    :meta="executions"
                    label="Paginación de procesos"
                />
            </CardContent>
        </Card>
    </PageFrame>
</template>
