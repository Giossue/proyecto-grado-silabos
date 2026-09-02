<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import ClientFilterBar from '@/components/domain/ClientFilterBar.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import SyllabusProcessActions from '@/components/domain/syllabus/SyllabusProcessActions.vue';
import SyllabusProcessSheet from '@/components/domain/syllabus/SyllabusProcessSheet.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
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
import { index as processesIndex } from '@/routes/admin/processes';

type ProcessRow = {
    id: string;
    name: string;
    state: string;
    template: string;
    starts_at: string;
    due_at: string;
    convocations_count: number;
    configurable: boolean;
};

const props = defineProps<{
    processes: ProcessRow[];
    /** Nombre de la plantilla institucional; nula si aún no existe. */
    template: string | null;
}>();

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Convocatorias', href: processesIndex() }],
    },
});

const stateLabel = (state: string): string =>
    ({
        preparacion: 'En preparación',
        abierto: 'Abierto',
        pausado: 'En pausa',
        cerrado: 'Cerrado',
    })[state] ?? 'Estado no disponible';

const formatDate = (value: string): string =>
    new Intl.DateTimeFormat('es-EC', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));

const filter = useClientFilter(
    () => props.processes,
    (item) => [item.name, item.template],
    {
        estado: {
            matches: (item, value) => item.state === value,
        },
    },
);

const {
    items: processPage,
    meta: processMeta,
    setPage: setProcessPage,
} = useClientPagination(() => filter.items.value);
</script>

<template>
    <Head title="Convocatorias" />
    <PageFrame
        title="Convocatorias de sílabos"
        description="El proceso institucional que obliga a todas las carreras: con qué plantilla se elaboran los sílabos y entre qué fechas. Cada coordinación convoca a su carrera dentro de él."
    >
        <template #actions>
            <SyllabusProcessSheet :template="template" />
        </template>

        <Card>
            <CardContent class="flex flex-col gap-4">
                <ClientFilterBar
                    :filter="filter"
                    input-id="processes-search"
                    label="Buscar proceso"
                    placeholder="Buscar por nombre o plantilla"
                >
                    <template #filters>
                        <Field>
                            <FieldLabel
                                for="processes-search-state"
                                class="sr-only"
                            >
                                Estado
                            </FieldLabel>
                            <Select v-model="filter.values.estado.value">
                                <SelectTrigger id="processes-search-state">
                                    <SelectValue
                                        placeholder="Todos los estados"
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem value="all"
                                            >Todos los estados</SelectItem
                                        >
                                        <SelectItem value="preparacion"
                                            >En preparación</SelectItem
                                        >
                                        <SelectItem value="abierto"
                                            >Abiertos</SelectItem
                                        >
                                        <SelectItem value="pausado"
                                            >En pausa</SelectItem
                                        >
                                        <SelectItem value="cerrado"
                                            >Cerrados</SelectItem
                                        >
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </Field>
                    </template>
                </ClientFilterBar>
                <Table data-cards="true">
                    <TableHeader>
                        <TableRow>
                            <TableHead>Proceso</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead>Plantilla</TableHead>
                            <TableHead>Inicio</TableHead>
                            <TableHead>Entrega</TableHead>
                            <TableHead class="text-right"
                                >Convocatorias</TableHead
                            >
                            <TableHead class="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableEmpty
                            v-if="processPage.length === 0"
                            :colspan="7"
                        >
                            {{
                                filter.active.value
                                    ? 'Ningún proceso coincide con la búsqueda.'
                                    : 'No hay procesos de sílabos. Prepare el primero con la plantilla y las fechas del calendario institucional.'
                            }}
                        </TableEmpty>
                        <TableRow
                            v-for="process in processPage"
                            v-else
                            :key="process.id"
                        >
                            <TableCell>{{ process.name }}</TableCell>
                            <TableCell>
                                {{ stateLabel(process.state) }}
                            </TableCell>
                            <TableCell>{{ process.template }}</TableCell>
                            <TableCell>{{
                                formatDate(process.starts_at)
                            }}</TableCell>
                            <TableCell>{{
                                formatDate(process.due_at)
                            }}</TableCell>
                            <TableCell class="text-right">
                                {{ process.convocations_count }}
                            </TableCell>
                            <TableCell class="text-right">
                                <SyllabusProcessActions
                                    :process="process"
                                    :template="template"
                                />
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
                <TablePagination
                    :meta="processMeta"
                    mode="client"
                    label="Paginación de procesos de sílabos"
                    @update:page="setProcessPage"
                />
            </CardContent>
        </Card>
    </PageFrame>
</template>
