<script setup lang="ts">
import { Head, router } from '@inertiajs/vue3';
import { RotateCw } from '@lucide/vue';
import { ref } from 'vue';
import FilterToolbar from '@/components/domain/FilterToolbar.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import TableActionsMenu from '@/components/domain/TableActionsMenu.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
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
    TableEmpty,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { index as jobsIndex, retry as retryJob } from '@/routes/admin/jobs';
import type { Paginated } from '@/types/pagination';

type Option = { value: string; label: string };

type Execution = {
    id: string;
    tipo: string;
    cola: string;
    estado: string;
    intentos: number;
    intentos_maximos: number;
    progreso: number;
    mensaje_error: string | null;
    creado_en: string | null;
    iniciado_en: string | null;
    finalizado_en: string | null;
    reintentable: boolean;
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

const retryCandidate = ref<Execution | null>(null);

const retry = (): void => {
    const execution = retryCandidate.value;

    if (!execution) {
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
                retryCandidate.value = null;
            },
        },
    );
};

const statusLabel = (value: string): string =>
    ({
        pendiente: 'En cola',
        en_ejecucion: 'En ejecución',
        completada: 'Completado',
        fallida: 'Fallido',
    })[value] ?? 'Estado no disponible';

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
                                            <SelectItem value="pendiente">
                                                En cola
                                            </SelectItem>
                                            <SelectItem value="en_ejecucion">
                                                En ejecución
                                            </SelectItem>
                                            <SelectItem value="completada">
                                                Completado
                                            </SelectItem>
                                            <SelectItem value="fallida">
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
                                execution.tipo
                            }}</TableCell>
                            <TableCell>{{ execution.cola }}</TableCell>
                            <TableCell>
                                <span
                                    :class="
                                        execution.estado === 'fallida'
                                            ? 'text-destructive'
                                            : execution.estado === 'completada'
                                              ? ''
                                              : ''
                                    "
                                    >{{ statusLabel(execution.estado) }}</span
                                >
                                <div
                                    v-if="
                                        ['pendiente', 'en_ejecucion'].includes(
                                            execution.estado,
                                        )
                                    "
                                    class="mt-1 text-xs text-muted-foreground"
                                >
                                    {{ execution.progreso }} %
                                </div>
                            </TableCell>
                            <TableCell>
                                {{ execution.intentos }} acumulado(s)
                                <div class="text-xs text-muted-foreground">
                                    máximo {{ execution.intentos_maximos }} por
                                    ciclo
                                </div>
                            </TableCell>
                            <TableCell class="text-xs">
                                <div>
                                    Inicio:
                                    {{ formatDate(execution.iniciado_en) }}
                                </div>
                                <div>
                                    Fin:
                                    {{ formatDate(execution.finalizado_en) }}
                                </div>
                            </TableCell>
                            <TableCell class="max-w-sm text-sm">
                                {{ execution.mensaje_error ?? '—' }}
                            </TableCell>
                            <TableCell class="text-right">
                                <TableActionsMenu
                                    :label="`Acciones para ${execution.tipo}`"
                                >
                                    <DropdownMenuItem
                                        v-if="execution.reintentable"
                                        :disabled="retryingId !== null"
                                        @select="retryCandidate = execution"
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
                        <TableEmpty
                            v-if="executions.data.length === 0"
                            :colspan="7"
                        >
                            No hay procesos para los filtros actuales.
                        </TableEmpty>
                    </TableBody>
                </Table>
                <TablePagination
                    :meta="executions"
                    label="Paginación de procesos"
                />
            </CardContent>
        </Card>

        <Dialog
            :open="retryCandidate !== null"
            @update:open="
                (isOpen) => {
                    if (!isOpen && retryingId === null) retryCandidate = null;
                }
            "
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Reintentar proceso</DialogTitle>
                    <DialogDescription>
                        Se volverá a encolar «{{ retryCandidate?.tipo }}». La
                        operación conserva el conteo y la auditoría de intentos
                        anteriores.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <DialogClose as-child>
                        <Button
                            type="button"
                            variant="outline"
                            :disabled="retryingId !== null"
                        >
                            Cancelar
                        </Button>
                    </DialogClose>
                    <Button
                        type="button"
                        :disabled="retryingId !== null"
                        @click="retry"
                    >
                        <Spinner
                            v-if="retryingId !== null"
                            data-icon="inline-start"
                        />
                        <RotateCw
                            v-else
                            data-icon="inline-start"
                            aria-hidden="true"
                        />
                        Reintentar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </PageFrame>
</template>
