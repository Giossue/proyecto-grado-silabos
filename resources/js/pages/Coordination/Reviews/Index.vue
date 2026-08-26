<script setup lang="ts">
import { Head, Link, router } from '@inertiajs/vue3';
import { ClipboardCheck, Eye } from '@lucide/vue';
import { ref } from 'vue';
import ReviewController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/ReviewController';
import FilterToolbar from '@/components/domain/FilterToolbar.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import TableActionsMenu from '@/components/domain/TableActionsMenu.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
import { Badge } from '@/components/ui/badge';
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
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { index as reviewsIndex } from '@/routes/reviews';
import type { Paginated } from '@/types/pagination';

type ReviewRow = {
    id: string;
    revision_id: string;
    revision_number: number;
    subject: string;
    code: string;
    period: string;
    state: string;
    teachers: string[];
    unresolved_observations: number;
    submitted_at: string;
};

const props = defineProps<{
    filters: { state: string; search: string };
    syllabi: Paginated<ReviewRow>;
}>();

defineOptions({
    layout: { breadcrumbs: [{ title: 'Revisión', href: reviewsIndex() }] },
});

const search = ref(props.filters.search);
const state = ref(props.filters.state || 'all');

const applyFilters = (): void => {
    router.get(
        ReviewController.index.url(),
        {
            search: search.value || undefined,
            state: state.value === 'all' ? undefined : state.value,
        },
        { preserveState: true, replace: true },
    );
};

const stateLabel = (value: string): string =>
    ({
        in_review: 'En revisión',
        correction_requested: 'Corrección solicitada',
        approved: 'Aprobado',
    })[value] ?? value;
</script>

<template>
    <Head title="Cola de revisión" />
    <PageFrame
        :icon="ClipboardCheck"
        title="Cola de revisión"
        description="Expedientes enviados, devueltos o aprobados dentro de la carrera activa."
    >
        <Card>
            <CardContent class="flex flex-col gap-4">
                <form @submit.prevent="applyFilters">
                    <FilterToolbar>
                        <template #search>
                            <Field>
                                <FieldLabel for="review-search" class="sr-only">
                                    Buscar por asignatura o código
                                </FieldLabel>
                                <Input
                                    id="review-search"
                                    v-model="search"
                                    type="search"
                                    placeholder="Buscar asignatura o código"
                                />
                            </Field>
                        </template>
                        <template #filters>
                            <Field>
                                <FieldLabel for="review-state" class="sr-only">
                                    Estado
                                </FieldLabel>
                                <Select v-model="state">
                                    <SelectTrigger id="review-state">
                                        <SelectValue
                                            placeholder="Todos los estados"
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem value="all">
                                                Todos los estados
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
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Asignatura</TableHead>
                            <TableHead>Docente(s)</TableHead>
                            <TableHead>Revisión</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead>Pendientes</TableHead>
                            <TableHead class="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow v-for="item in syllabi.data" :key="item.id">
                            <TableCell>
                                <div class="font-medium">
                                    {{ item.subject }}
                                </div>
                                <div class="text-sm text-muted-foreground">
                                    {{ item.code }} · {{ item.period }}
                                </div>
                            </TableCell>
                            <TableCell>{{
                                item.teachers.join(', ')
                            }}</TableCell>
                            <TableCell>
                                N.º {{ item.revision_number }}
                            </TableCell>
                            <TableCell>
                                <Badge variant="outline">
                                    {{ stateLabel(item.state) }}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                <Badge
                                    :variant="
                                        item.unresolved_observations > 0
                                            ? 'destructive'
                                            : 'secondary'
                                    "
                                >
                                    {{ item.unresolved_observations }}
                                </Badge>
                            </TableCell>
                            <TableCell class="text-right">
                                <TableActionsMenu
                                    :label="`Acciones para ${item.subject}`"
                                >
                                    <DropdownMenuItem as-child>
                                        <Link
                                            :href="
                                                ReviewController.show(
                                                    item.revision_id,
                                                )
                                            "
                                        >
                                            <Eye aria-hidden="true" />
                                            Abrir revisión
                                        </Link>
                                    </DropdownMenuItem>
                                </TableActionsMenu>
                            </TableCell>
                        </TableRow>
                        <TableRow v-if="syllabi.data.length === 0">
                            <TableCell colspan="6" class="py-10 text-center">
                                No hay expedientes para los filtros
                                seleccionados.
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>

                <TablePagination
                    :meta="syllabi"
                    label="Paginación de expedientes en revisión"
                />
            </CardContent>
        </Card>
    </PageFrame>
</template>
