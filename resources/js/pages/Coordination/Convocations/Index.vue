<script setup lang="ts">
import { Form, Head } from '@inertiajs/vue3';
import ConvocationController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/ConvocationController';
import FilterToolbar from '@/components/domain/FilterToolbar.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import ConvocationActions from '@/components/domain/syllabus/ConvocationActions.vue';
import ConvocationCreationSheet from '@/components/domain/syllabus/ConvocationCreationSheet.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
import { Card, CardContent } from '@/components/ui/card';
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
import {
    Table,
    TableBody,
    TableCell,
    TableEmpty,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { index as convocationsIndex } from '@/routes/convocations';
import type { Paginated } from '@/types/pagination';

type ConvocationRow = {
    id: string;
    name: string;
    state: string;
    process: string;
    process_state: string;
    grouping_mode: string;
    period: string;
    period_id: string;
    source_ids: string[];
    template: string;
    syllabi_count: number;
};

defineProps<{
    convocations: Paginated<ConvocationRow>;
    filters: { q: string | null; state: string | null };
    periods: { id: string; nombre: string }[];
    processes: {
        id: string;
        label: string;
        state: string;
        template: string;
        starts_at: string;
        due_at: string;
    }[];
    sources: { id: string; label: string }[];
}>();

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Convocatorias', href: convocationsIndex() }],
    },
});

const stateLabel = (state: string): string =>
    ({
        preparacion: 'En preparación',
        abierta: 'Abierta',
        pausada: 'En pausa',
        cerrada: 'Cerrada',
    })[state] ?? 'Estado no disponible';

// Una convocatoria abierta cuyo proceso institucional está en pausa tampoco avanza:
// se dice aquí, para no tener que abrirla a averiguarlo.
const processNote = (row: ConvocationRow): string | null =>
    row.state === 'abierta' && row.process_state === 'pausado'
        ? 'Proceso institucional en pausa'
        : null;
</script>

<template>
    <Head title="Convocatorias" />
    <PageFrame
        title="Convocatorias de sílabos"
        description="Cada convocatoria abre los sílabos de un periodo y fija con qué formato se llenan."
    >
        <template #actions>
            <ConvocationCreationSheet
                :periods="periods"
                :processes="processes"
                :sources="sources"
            />
        </template>

        <Card>
            <CardContent class="flex flex-col gap-4">
                <Form
                    v-bind="ConvocationController.index.form()"
                    :options="{
                        preserveState: true,
                        preserveScroll: true,
                        replace: true,
                    }"
                >
                    <FilterToolbar>
                        <template #search>
                            <Field>
                                <FieldLabel
                                    for="convocations-search"
                                    class="sr-only"
                                    >Buscar convocatoria</FieldLabel
                                >
                                <Input
                                    id="convocations-search"
                                    name="q"
                                    type="search"
                                    :default-value="filters.q ?? ''"
                                    placeholder="Buscar por nombre o periodo"
                                />
                            </Field>
                        </template>
                        <template #filters>
                            <Field>
                                <FieldLabel
                                    for="convocations-state"
                                    class="sr-only"
                                    >Estado</FieldLabel
                                >
                                <Select
                                    name="state"
                                    :default-value="filters.state ?? 'all'"
                                >
                                    <SelectTrigger id="convocations-state">
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
                                            <SelectItem value="abierta"
                                                >Abiertas</SelectItem
                                            >
                                            <SelectItem value="pausada"
                                                >En pausa</SelectItem
                                            >
                                            <SelectItem value="cerrada"
                                                >Cerradas</SelectItem
                                            >
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>
                        </template>
                    </FilterToolbar>
                </Form>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Convocatoria</TableHead>
                            <TableHead>Periodo</TableHead>
                            <TableHead>Proceso y configuración</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead class="text-right"
                                >Expedientes</TableHead
                            >
                            <TableHead class="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableEmpty
                            v-if="convocations.data.length === 0"
                            :colspan="6"
                        >
                            No existen convocatorias con este rol.
                        </TableEmpty>
                        <TableRow
                            v-for="convocation in convocations.data"
                            v-else
                            :key="convocation.id"
                        >
                            <TableCell>{{ convocation.name }}</TableCell>
                            <TableCell>{{ convocation.period }}</TableCell>
                            <TableCell>
                                <div>{{ convocation.process }}</div>
                                <div class="text-sm text-muted-foreground">
                                    {{ convocation.template }} ·
                                    {{
                                        convocation.grouping_mode ===
                                        'por_paralelo'
                                            ? 'Por paralelo'
                                            : 'Por oferta'
                                    }}
                                </div>
                            </TableCell>
                            <TableCell>
                                <div>{{ stateLabel(convocation.state) }}</div>
                                <div
                                    v-if="processNote(convocation)"
                                    class="text-sm text-muted-foreground"
                                >
                                    {{ processNote(convocation) }}
                                </div>
                            </TableCell>
                            <TableCell class="text-right">
                                {{ convocation.syllabi_count }}
                            </TableCell>
                            <TableCell class="text-right">
                                <ConvocationActions
                                    :convocation="convocation"
                                    :periods="periods"
                                    :sources="sources"
                                />
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>

                <TablePagination
                    :meta="convocations"
                    label="Paginación de convocatorias"
                />
            </CardContent>
        </Card>
    </PageFrame>
</template>
