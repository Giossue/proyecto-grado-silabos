<script setup lang="ts">
import RecordStatusForm from '@/components/domain/academic/RecordStatusForm.vue';
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

const props =
    defineProps<Pick<AcademicStructureProps, 'coordinatorAssignments'>>();
const {
    items: assignmentPage,
    meta: assignmentMeta,
    setPage: setAssignmentPage,
} = useClientPagination(() => props.coordinatorAssignments);
</script>

<template>
    <div class="flex flex-col gap-6">
        <Card>
            <CardContent class="flex flex-col gap-4">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Persona</TableHead>
                            <TableHead>Carrera</TableHead>
                            <TableHead>Vigencia</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead class="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableEmpty
                            v-if="coordinatorAssignments.length === 0"
                            :colspan="5"
                        >
                            No existen asignaciones de coordinación.
                        </TableEmpty>
                        <TableRow
                            v-for="item in assignmentPage"
                            v-else
                            :key="item.id"
                        >
                            <TableCell class="font-medium">
                                {{ item.user_name }}
                            </TableCell>
                            <TableCell>{{ item.career_name }}</TableCell>
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
                                    :label="`Acciones para ${item.user_name}`"
                                >
                                    <RecordStatusForm
                                        display="menu"
                                        scope="governance"
                                        entity="coordinator_assignment"
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
                    label="Paginación de responsables de carrera"
                    @update:page="setAssignmentPage"
                />
            </CardContent>
        </Card>
    </div>
</template>
