<script setup lang="ts">
import { Head, Link, router } from '@inertiajs/vue3';
import { ChartNoAxesCombined, Eye } from '@lucide/vue';
import { ref } from 'vue';
import OperationalReportController from '@/actions/App/Modules/Operations/Presentation/Http/Controllers/OperationalReportController';
import FilterToolbar from '@/components/domain/FilterToolbar.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import TableActionsMenu from '@/components/domain/TableActionsMenu.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { useClientPagination } from '@/composables/useClientPagination';
import { index as reportsIndex } from '@/routes/reports';
import { show as reviewShow } from '@/routes/reviews';
import type { Paginated } from '@/types/pagination';

type Convocation = {
    id: string;
    name: string;
    period: string;
    state: string;
};

type Breakdown = {
    id: string;
    name: string;
    total: number;
    not_started: number;
    draft: number;
    in_review: number;
    correction_requested: number;
    approved: number;
};

type SyllabusRow = {
    id: string;
    subject: string;
    code: string;
    convocation: string;
    period: string;
    state: string;
    completion: number;
    teachers: string[];
    unresolved_observations: number;
    updated_at: string | null;
    latest_revision_id: string | null;
};

const props = defineProps<{
    filters: { convocation: string; state: string; search: string };
    convocations: Convocation[];
    indicators: {
        total: number;
        teacher_action: number;
        coordination_action: number;
        approved: number;
        average_completion: number;
        states: Record<string, number>;
    };
    convocation_breakdown: Breakdown[];
    syllabi: Paginated<SyllabusRow>;
}>();

defineOptions({
    layout: { breadcrumbs: [{ title: 'Informes', href: reportsIndex() }] },
});

const convocation = ref(props.filters.convocation || 'all');
const state = ref(props.filters.state || 'all');
const search = ref(props.filters.search);
const {
    items: convocationPage,
    meta: convocationMeta,
    setPage: setConvocationPage,
} = useClientPagination(() => props.convocation_breakdown);

const applyFilters = (): void => {
    router.get(
        OperationalReportController.index.url(),
        {
            convocation:
                convocation.value === 'all' ? undefined : convocation.value,
            state: state.value === 'all' ? undefined : state.value,
            search: search.value || undefined,
        },
        { preserveState: true, preserveScroll: true, replace: true },
    );
};

const stateLabel = (value: string): string =>
    ({
        not_started: 'Sin iniciar',
        draft: 'Borrador',
        in_review: 'En revisión',
        correction_requested: 'Corrección solicitada',
        approved: 'Aprobado',
    })[value] ?? value;
</script>

<template>
    <Head title="Informes de avance" />
    <PageFrame
        :icon="ChartNoAxesCombined"
        title="Informes de avance"
        description="Indicadores operativos calculados únicamente dentro de la carrera del rol activo."
    >
        <Card>
            <CardHeader>
                <CardTitle>Alcance del informe</CardTitle>
                <CardDescription>
                    Los filtros se conservan en la URL y se aplican tanto a los
                    indicadores como al detalle.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form @submit.prevent="applyFilters">
                    <FilterToolbar>
                        <template #search>
                            <Field>
                                <FieldLabel for="report-search" class="sr-only">
                                    Buscar asignatura o código
                                </FieldLabel>
                                <Input
                                    id="report-search"
                                    v-model="search"
                                    type="search"
                                    placeholder="Buscar asignatura o código"
                                />
                            </Field>
                        </template>
                        <template #filters>
                            <Field>
                                <FieldLabel
                                    for="report-convocation"
                                    class="sr-only"
                                >
                                    Convocatoria
                                </FieldLabel>
                                <Select v-model="convocation">
                                    <SelectTrigger id="report-convocation">
                                        <SelectValue
                                            placeholder="Todas las convocatorias"
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem value="all">
                                                Todas las convocatorias
                                            </SelectItem>
                                            <SelectItem
                                                v-for="item in convocations"
                                                :key="item.id"
                                                :value="item.id"
                                            >
                                                {{ item.name }} ·
                                                {{ item.period }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field>
                                <FieldLabel for="report-state" class="sr-only">
                                    Estado
                                </FieldLabel>
                                <Select v-model="state">
                                    <SelectTrigger id="report-state">
                                        <SelectValue
                                            placeholder="Todos los estados"
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem value="all">
                                                Todos los estados
                                            </SelectItem>
                                            <SelectItem value="not_started">
                                                Sin iniciar
                                            </SelectItem>
                                            <SelectItem value="draft">
                                                Borrador
                                            </SelectItem>
                                            <SelectItem value="in_review">
                                                En revisión
                                            </SelectItem>
                                            <SelectItem
                                                value="correction_requested"
                                            >
                                                Corrección solicitada
                                            </SelectItem>
                                            <SelectItem value="approved">
                                                Aprobado
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>
                        </template>
                    </FilterToolbar>
                </form>
            </CardContent>
        </Card>

        <section
            class="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"
            aria-label="Indicadores"
        >
            <Card>
                <CardHeader class="pb-2">
                    <CardDescription>Expedientes filtrados</CardDescription>
                    <CardTitle class="text-3xl">{{
                        indicators.total
                    }}</CardTitle>
                </CardHeader>
            </Card>
            <Card>
                <CardHeader class="pb-2">
                    <CardDescription>Acción docente</CardDescription>
                    <CardTitle class="text-3xl">{{
                        indicators.teacher_action
                    }}</CardTitle>
                </CardHeader>
                <CardContent class="text-xs text-muted-foreground">
                    Sin iniciar, borrador o corrección solicitada.
                </CardContent>
            </Card>
            <Card>
                <CardHeader class="pb-2">
                    <CardDescription>Acción de coordinación</CardDescription>
                    <CardTitle class="text-3xl">{{
                        indicators.coordination_action
                    }}</CardTitle>
                </CardHeader>
                <CardContent class="text-xs text-muted-foreground">
                    Revisiones actualmente enviadas.
                </CardContent>
            </Card>
            <Card>
                <CardHeader class="pb-2">
                    <CardDescription>Aprobados</CardDescription>
                    <CardTitle class="text-3xl">{{
                        indicators.approved
                    }}</CardTitle>
                </CardHeader>
            </Card>
            <Card>
                <CardHeader class="pb-2">
                    <CardDescription>Completitud media</CardDescription>
                    <CardTitle class="text-3xl">
                        {{ indicators.average_completion.toFixed(1) }} %
                    </CardTitle>
                </CardHeader>
                <CardContent class="text-xs text-muted-foreground">
                    Promedio de campos obligatorios completos; no es una meta.
                </CardContent>
            </Card>
        </section>

        <Card>
            <CardHeader>
                <CardTitle>Distribución por convocatoria</CardTitle>
                <CardDescription>
                    Conteos bajo los mismos filtros y alcance de carrera.
                </CardDescription>
            </CardHeader>
            <CardContent class="flex flex-col gap-4">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Convocatoria</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Sin iniciar</TableHead>
                            <TableHead>Borrador</TableHead>
                            <TableHead>En revisión</TableHead>
                            <TableHead>Corrección</TableHead>
                            <TableHead>Aprobado</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow
                            v-for="item in convocationPage"
                            :key="item.id"
                        >
                            <TableCell class="font-medium">{{
                                item.name
                            }}</TableCell>
                            <TableCell>{{ item.total }}</TableCell>
                            <TableCell>{{ item.not_started }}</TableCell>
                            <TableCell>{{ item.draft }}</TableCell>
                            <TableCell>{{ item.in_review }}</TableCell>
                            <TableCell>{{
                                item.correction_requested
                            }}</TableCell>
                            <TableCell>{{ item.approved }}</TableCell>
                        </TableRow>
                        <TableRow v-if="convocation_breakdown.length === 0">
                            <TableCell
                                colspan="7"
                                class="py-8 text-center text-muted-foreground"
                            >
                                No hay convocatorias con expedientes para los
                                filtros actuales.
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
                <TablePagination
                    :meta="convocationMeta"
                    mode="client"
                    label="Paginación de distribución por convocatoria"
                    @update:page="setConvocationPage"
                />
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Detalle de expedientes</CardTitle>
                <CardDescription>
                    {{ syllabi.total }} resultado(s), paginados sin ampliar el
                    alcance.
                </CardDescription>
            </CardHeader>
            <CardContent class="flex flex-col gap-4">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Asignatura</TableHead>
                            <TableHead>Convocatoria</TableHead>
                            <TableHead>Docentes</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead>Completitud</TableHead>
                            <TableHead>Observaciones</TableHead>
                            <TableHead class="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow v-for="item in syllabi.data" :key="item.id">
                            <TableCell>
                                <div class="font-medium">
                                    {{ item.subject }}
                                </div>
                                <div class="text-xs text-muted-foreground">
                                    {{ item.code }}
                                </div>
                            </TableCell>
                            <TableCell>
                                <div>{{ item.convocation }}</div>
                                <div class="text-xs text-muted-foreground">
                                    {{ item.period }}
                                </div>
                            </TableCell>
                            <TableCell>{{
                                item.teachers.join(', ') || 'Sin asignación'
                            }}</TableCell>
                            <TableCell>
                                {{ stateLabel(item.state) }}
                            </TableCell>
                            <TableCell
                                >{{ item.completion.toFixed(0) }} %</TableCell
                            >
                            <TableCell>{{
                                item.unresolved_observations
                            }}</TableCell>
                            <TableCell class="text-right">
                                <TableActionsMenu
                                    :label="`Acciones para ${item.subject}`"
                                >
                                    <DropdownMenuItem
                                        v-if="item.latest_revision_id"
                                        as-child
                                    >
                                        <Link
                                            :href="
                                                reviewShow(
                                                    item.latest_revision_id,
                                                )
                                            "
                                        >
                                            <Eye aria-hidden="true" />
                                            Abrir revisión
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem v-else disabled>
                                        Sin revisión disponible
                                    </DropdownMenuItem>
                                </TableActionsMenu>
                            </TableCell>
                        </TableRow>
                        <TableRow v-if="syllabi.data.length === 0">
                            <TableCell
                                colspan="7"
                                class="py-8 text-center text-muted-foreground"
                            >
                                No hay expedientes para los filtros actuales.
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
                <TablePagination
                    :meta="syllabi"
                    label="Paginación del detalle de expedientes"
                />
            </CardContent>
        </Card>
    </PageFrame>
</template>
