<script setup lang="ts">
import RecordStatusForm from '@/components/domain/academic/RecordStatusForm.vue';
import ClientFilterBar from '@/components/domain/ClientFilterBar.vue';
import UserProfileSheet from '@/components/domain/identity/UserProfileSheet.vue';
import TableActionsMenu from '@/components/domain/TableActionsMenu.vue';
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
import type { AcademicStructureProps } from '@/types/academic';

const props = defineProps<Pick<AcademicStructureProps, 'teacherAssignments'>>();

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
                    v-model="filter.search.value"
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
                                            Archivadas
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
                            <TableHead>Vigencia</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead class="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableEmpty
                            v-if="teacherAssignments.length === 0"
                            :colspan="7"
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
                            <TableCell class="font-medium">
                                {{ item.user_name }}
                            </TableCell>
                            <TableCell>{{ item.subject_name }}</TableCell>
                            <TableCell>{{ item.period_name }}</TableCell>
                            <TableCell>{{ item.parallel_code }}</TableCell>
                            <TableCell>
                                {{ item.valid_from }} →
                                {{ item.valid_until ?? 'Sin fecha de fin' }}
                            </TableCell>
                            <TableCell>
                                {{ item.active ? 'Activa' : 'Archivada' }}
                            </TableCell>
                            <TableCell class="text-right">
                                <TableActionsMenu
                                    :label="`Acciones para la asignación de ${item.user_name}`"
                                >
                                    <UserProfileSheet
                                        display="menu"
                                        :user-id="item.user_id"
                                        :name="item.user_name"
                                        :email="item.user_email"
                                    />
                                    <RecordStatusForm
                                        display="menu"
                                        scope="career"
                                        entity="teacher_assignment"
                                        :record-id="item.id"
                                        :active="item.active"
                                    />
                                </TableActionsMenu>
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
    </div>
</template>
