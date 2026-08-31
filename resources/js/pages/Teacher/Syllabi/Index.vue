<script setup lang="ts">
import { Form, Head, Link } from '@inertiajs/vue3';
import { Eye } from '@lucide/vue';
import SyllabusController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/SyllabusController';
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
import {
    Table,
    TableBody,
    TableCell,
    TableEmpty,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { index as syllabiIndex } from '@/routes/syllabi';
import type { Paginated } from '@/types/pagination';

type SyllabusRow = {
    id: string;
    subject: string;
    code: string;
    convocation: string;
    period: string;
    state: string;
    completion: number;
    parallels: string[];
    saved_at: string | null;
};

defineProps<{
    syllabi: Paginated<SyllabusRow>;
    filters: { q: string | null; state: string | null };
}>();

defineOptions({
    layout: { breadcrumbs: [{ title: 'Mis sílabos', href: syllabiIndex() }] },
});

const stateLabel = (state: string): string =>
    ({
        not_started: 'Sin iniciar',
        draft: 'Borrador',
        in_review: 'En revisión',
        correction_requested: 'Corrección solicitada',
        approved: 'Aprobado',
    })[state] ?? state;

const formatSavedAt = (value: string | null): string =>
    value
        ? new Intl.DateTimeFormat('es-EC', {
              dateStyle: 'medium',
              timeStyle: 'short',
          }).format(new Date(value))
        : 'Sin guardados';
</script>

<template>
    <Head title="Mis sílabos" />
    <PageFrame
        title="Mis sílabos"
        description="Los sílabos de las materias que usted dicta."
    >
        <Card>
            <CardContent class="flex flex-col gap-4">
                <!-- Paginado en servidor: solo llega la página actual, así que el filtro
                     se resuelve allá, donde está el resto de los expedientes. -->
                <Form
                    v-bind="SyllabusController.index.form()"
                    :options="{
                        preserveState: true,
                        preserveScroll: true,
                        replace: true,
                    }"
                >
                    <FilterToolbar>
                        <template #search>
                            <Field>
                                <FieldLabel for="syllabi-search" class="sr-only"
                                    >Buscar sílabo</FieldLabel
                                >
                                <Input
                                    id="syllabi-search"
                                    name="q"
                                    type="search"
                                    :default-value="filters.q ?? ''"
                                    placeholder="Buscar por asignatura, código o convocatoria"
                                />
                            </Field>
                        </template>
                        <template #filters>
                            <Field>
                                <FieldLabel for="syllabi-state" class="sr-only"
                                    >Estado</FieldLabel
                                >
                                <Select
                                    name="state"
                                    :default-value="filters.state ?? 'all'"
                                >
                                    <SelectTrigger id="syllabi-state">
                                        <SelectValue
                                            placeholder="Todos los estados"
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem value="all"
                                                >Todos los estados</SelectItem
                                            >
                                            <SelectItem value="not_started"
                                                >Sin iniciar</SelectItem
                                            >
                                            <SelectItem value="draft"
                                                >Borrador</SelectItem
                                            >
                                            <SelectItem value="in_review"
                                                >En revisión</SelectItem
                                            >
                                            <SelectItem
                                                value="correction_requested"
                                                >Corrección
                                                solicitada</SelectItem
                                            >
                                            <SelectItem value="approved"
                                                >Aprobado</SelectItem
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
                            <TableHead>Asignatura</TableHead>
                            <TableHead>Convocatoria</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead>Último guardado</TableHead>
                            <TableHead class="text-right">Avance</TableHead>
                            <TableHead class="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableEmpty
                            v-if="syllabi.data.length === 0"
                            :colspan="6"
                        >
                            No tiene sílabos asignados con este rol.
                        </TableEmpty>
                        <TableRow
                            v-for="syllabus in syllabi.data"
                            v-else
                            :key="syllabus.id"
                        >
                            <TableCell>
                                <span class="font-medium">
                                    {{ syllabus.subject }}
                                </span>
                                <div class="text-sm text-muted-foreground">
                                    {{ syllabus.code }} · Paralelo(s)
                                    {{ syllabus.parallels.join(', ') }}
                                </div>
                            </TableCell>
                            <TableCell>
                                <div>{{ syllabus.convocation }}</div>
                                <div class="text-sm text-muted-foreground">
                                    {{ syllabus.period }}
                                </div>
                            </TableCell>
                            <TableCell>
                                {{ stateLabel(syllabus.state) }}
                            </TableCell>
                            <TableCell>{{
                                formatSavedAt(syllabus.saved_at)
                            }}</TableCell>
                            <TableCell class="text-right font-medium">
                                {{ syllabus.completion.toFixed(0) }} %
                            </TableCell>
                            <TableCell class="text-right">
                                <TableActionsMenu
                                    :label="`Acciones para ${syllabus.subject}`"
                                >
                                    <DropdownMenuItem as-child>
                                        <Link
                                            :href="
                                                SyllabusController.show(
                                                    syllabus.id,
                                                )
                                            "
                                        >
                                            <Eye aria-hidden="true" />
                                            Abrir sílabo
                                        </Link>
                                    </DropdownMenuItem>
                                </TableActionsMenu>
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>

                <TablePagination
                    :meta="syllabi"
                    label="Paginación de sílabos asignados"
                />
            </CardContent>
        </Card>
    </PageFrame>
</template>
