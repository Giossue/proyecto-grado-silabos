<script setup lang="ts">
import { Form, Head, Link } from '@inertiajs/vue3';
import { Eye } from '@lucide/vue';
import ConvocationController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/ConvocationController';
import FilterToolbar from '@/components/domain/FilterToolbar.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import ConvocationCreationSheet from '@/components/domain/syllabus/ConvocationCreationSheet.vue';
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
    grouping_mode: string;
    period: string;
    template: string;
    syllabi_count: number;
};

defineProps<{
    convocations: Paginated<ConvocationRow>;
    filters: { q: string | null; state: string | null };
    periods: { id: string; nombre: string }[];
    templates: { id: string; label: string }[];
    sources: { id: string; label: string }[];
}>();

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Convocatorias', href: convocationsIndex() }],
    },
});

const stateLabel = (state: string): string =>
    ({ preparacion: 'En preparación', abierta: 'Abierta', cerrada: 'Cerrada' })[
        state
    ] ?? 'Estado no disponible';
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
                :templates="templates"
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
                            <TableHead>Configuración</TableHead>
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
                                <div>{{ convocation.template }}</div>
                                <div class="text-sm text-muted-foreground">
                                    {{
                                        convocation.grouping_mode ===
                                        'por_paralelo'
                                            ? 'Por paralelo'
                                            : 'Por oferta'
                                    }}
                                </div>
                            </TableCell>
                            <TableCell>
                                {{ stateLabel(convocation.state) }}
                            </TableCell>
                            <TableCell class="text-right">
                                {{ convocation.syllabi_count }}
                            </TableCell>
                            <TableCell class="text-right">
                                <TableActionsMenu
                                    :label="`Acciones para ${convocation.name}`"
                                >
                                    <DropdownMenuItem as-child>
                                        <Link
                                            :href="
                                                ConvocationController.show(
                                                    convocation.id,
                                                )
                                            "
                                        >
                                            <Eye aria-hidden="true" />
                                            Abrir convocatoria
                                        </Link>
                                    </DropdownMenuItem>
                                </TableActionsMenu>
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
