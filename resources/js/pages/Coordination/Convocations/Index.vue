<script setup lang="ts">
import { Form, Head } from '@inertiajs/vue3';
import ConvocationController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/ConvocationController';
import FilterToolbar from '@/components/domain/FilterToolbar.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import ConvocationActions from '@/components/domain/syllabus/ConvocationActions.vue';
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
    id: string | null;
    process_id: string;
    name: string;
    state: string;
    process_state: string;
    period: string;
    template: string;
    syllabi_count: number;
};

defineProps<{
    convocations: Paginated<ConvocationRow>;
    filters: { q: string | null; state: string | null };
}>();

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Convocatorias', href: convocationsIndex() }],
    },
});

const stateLabel = (state: string): string =>
    ({
        sin_iniciar: 'Sin iniciar',
        preparacion: 'En preparación',
        abierto: 'Abierta',
        abierta: 'Abierta',
        pausado: 'En pausa',
        pausada: 'En pausa',
        cerrado: 'Cerrada',
        cerrada: 'Cerrada',
    })[state] ?? 'Estado no disponible';
</script>

<template>
    <Head title="Convocatorias" />
    <PageFrame
        title="Convocatorias de sílabos"
        description="Inicie la convocatoria de su carrera desde Acciones cuando su configuración académica esté lista."
    >
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
                                            <SelectItem value="sin_iniciar"
                                                >Sin iniciar</SelectItem
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
                            <TableHead>Estado institucional</TableHead>
                            <TableHead>Estado de la carrera</TableHead>
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
                            No hay convocatorias para los filtros actuales.
                        </TableEmpty>
                        <TableRow
                            v-for="convocation in convocations.data"
                            v-else
                            :key="convocation.process_id"
                        >
                            <TableCell>{{ convocation.name }}</TableCell>
                            <TableCell>{{ convocation.period }}</TableCell>
                            <TableCell>
                                {{ stateLabel(convocation.process_state) }}
                            </TableCell>
                            <TableCell>
                                <div>{{ stateLabel(convocation.state) }}</div>
                            </TableCell>
                            <TableCell class="text-right">
                                {{ convocation.syllabi_count }}
                            </TableCell>
                            <TableCell class="text-right">
                                <ConvocationActions
                                    :convocation="convocation"
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
