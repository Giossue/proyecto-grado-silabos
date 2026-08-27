<script setup lang="ts">
import RecordStatusForm from '@/components/domain/academic/RecordStatusForm.vue';
import UserProfileSheet from '@/components/domain/identity/UserProfileSheet.vue';
import TableActionsMenu from '@/components/domain/TableActionsMenu.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableEmpty,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { useClientPagination } from '@/composables/useClientPagination';
import type { AcademicStructureProps } from '@/types/academic';

const props = defineProps<Pick<AcademicStructureProps, 'teacherAssignments'>>();
const {
    items: assignmentPage,
    meta: assignmentMeta,
    setPage: setAssignmentPage,
} = useClientPagination(() => props.teacherAssignments);
</script>

<template>
    <div class="flex flex-col gap-6">
        <Card>
            <CardContent class="flex flex-col gap-4">
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
                            No existen asignaciones docentes en esta carrera.
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
                                <Badge
                                    :variant="
                                        item.active ? 'secondary' : 'outline'
                                    "
                                >
                                    {{ item.active ? 'Activa' : 'Archivada' }}
                                </Badge>
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
