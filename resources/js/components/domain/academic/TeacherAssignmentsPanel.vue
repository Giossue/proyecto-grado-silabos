<script setup lang="ts">
import { UserRoundCog } from '@lucide/vue';
import { ref } from 'vue';
import CareerAcademicActions from '@/components/domain/academic/CareerAcademicActions.vue';
import TeacherReliefSheet from '@/components/domain/academic/TeacherReliefSheet.vue';
import ClientFilterBar from '@/components/domain/ClientFilterBar.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
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
import type { AcademicStructureProps } from '@/types/academic';

const props = defineProps<
    Pick<AcademicStructureProps, 'teacherAssignments' | 'options'> & {
        lockReason?: string | null;
    }
>();

type TeacherAssignment = AcademicStructureProps['teacherAssignments'][number];
type OutgoingTeacher = {
    id: string;
    name: string;
    parallelCount: number;
};

const reliefOpen = ref(false);
const outgoingTeacher = ref<OutgoingTeacher | null>(null);
const openTeacherRelief = (assignment: TeacherAssignment): void => {
    outgoingTeacher.value = {
        id: assignment.user_id,
        name: assignment.user_name,
        parallelCount: props.teacherAssignments.filter(
            (item) =>
                item.user_id === assignment.user_id &&
                item.active &&
                item.period_planning_enabled,
        ).length,
    };
    reliefOpen.value = true;
};

const filter = useClientFilter(
    () => props.teacherAssignments,
    (item) => [
        item.user_name,
        item.user_email,
        item.subject_name,
        item.parallel_code,
        item.period_name,
    ],
    {
        estado: {
            matches: (item, value) => item.active === (value === 'active'),
        },
    },
);

const {
    items: assignmentPage,
    meta: assignmentMeta,
    setPage: setAssignmentPage,
} = useClientPagination(() => filter.items.value);
</script>

<template>
    <div class="flex flex-col gap-6">
        <Card>
            <CardContent class="flex flex-col gap-4">
                <ClientFilterBar
                    :filter="filter"
                    input-id="teacher-assignments-search"
                    label="Buscar asignación docente"
                    placeholder="Buscar por docente, correo, materia o paralelo"
                >
                    <template #filters>
                        <Field>
                            <FieldLabel
                                for="teacher-assignments-state"
                                class="sr-only"
                            >
                                Estado
                            </FieldLabel>
                            <Select v-model="filter.values.estado.value">
                                <SelectTrigger id="teacher-assignments-state">
                                    <SelectValue
                                        placeholder="Todos los estados"
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem value="all">
                                            Todos los estados
                                        </SelectItem>
                                        <SelectItem value="active">
                                            Activas
                                        </SelectItem>
                                        <SelectItem value="inactive">
                                            Finalizadas
                                        </SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </Field>
                    </template>
                </ClientFilterBar>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Docente</TableHead>
                            <TableHead>Materia</TableHead>
                            <TableHead>Periodo</TableHead>
                            <TableHead>Paralelo</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead class="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableEmpty
                            v-if="teacherAssignments.length === 0"
                            :colspan="6"
                        >
                            {{
                                filter.active.value
                                    ? 'Ninguna asignación coincide con la búsqueda.'
                                    : 'No existen asignaciones docentes en esta carrera.'
                            }}
                        </TableEmpty>
                        <TableRow
                            v-for="item in assignmentPage"
                            v-else
                            :key="item.id"
                        >
                            <TableCell>
                                {{ item.user_name }}
                            </TableCell>
                            <TableCell>{{ item.subject_name }}</TableCell>
                            <TableCell>{{ item.period_name }}</TableCell>
                            <TableCell>{{ item.parallel_code }}</TableCell>
                            <TableCell>
                                {{ item.active ? 'Activa' : 'Finalizada' }}
                            </TableCell>
                            <TableCell class="text-right">
                                <CareerAcademicActions
                                    entity="asignacion_docente"
                                    :record="item"
                                    :record-label="`la asignación de ${item.user_name}`"
                                    :editable="item.editable"
                                    :active="item.active"
                                    :delete-supported="
                                        !lockReason &&
                                        item.period_planning_enabled
                                    "
                                    :locked-label="
                                        !item.period_planning_enabled
                                            ? item.period_status ===
                                              'finalizado'
                                                ? 'Período finalizado: disponible solo para consulta'
                                                : 'Período inactivo: disponible solo para consulta'
                                            : (lockReason ?? undefined)
                                    "
                                    :options="options"
                                >
                                    <DropdownMenuItem
                                        v-if="
                                            !lockReason &&
                                            item.active &&
                                            item.period_planning_enabled
                                        "
                                        @select="openTeacherRelief(item)"
                                    >
                                        <UserRoundCog aria-hidden="true" />
                                        Relevar docente
                                    </DropdownMenuItem>
                                </CareerAcademicActions>
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
                <TablePagination
                    :meta="assignmentMeta"
                    mode="client"
                    label="Paginación de asignaciones docentes"
                    @update:page="setAssignmentPage"
                />
            </CardContent>
        </Card>

        <TeacherReliefSheet
            v-if="outgoingTeacher"
            v-model:open="reliefOpen"
            :outgoing-teacher="outgoingTeacher"
            :options="options"
        />
    </div>
</template>
