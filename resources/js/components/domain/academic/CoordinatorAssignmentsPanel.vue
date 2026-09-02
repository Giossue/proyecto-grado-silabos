<script setup lang="ts">
import RecordStatusForm from '@/components/domain/academic/RecordStatusForm.vue';
import ClientFilterBar from '@/components/domain/ClientFilterBar.vue';
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

const props =
    defineProps<Pick<AcademicStructureProps, 'coordinatorAssignments'>>();
const filter = useClientFilter(
    () => props.coordinatorAssignments,
    (item) => [item.user_name, item.career_name],
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
                    input-id="coordinator-assignments-search"
                    label="Buscar coordinación"
                    placeholder="Buscar por persona o carrera"
                >
                    <template #filters>
                        <Field>
                            <FieldLabel
                                for="coordinator-assignments-search-state"
                                class="sr-only"
                            >
                                Estado
                            </FieldLabel>
                            <Select v-model="filter.values.estado.value">
                                <SelectTrigger
                                    id="coordinator-assignments-search-state"
                                >
                                    <SelectValue
                                        placeholder="Todos los estados"
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem value="all"
                                            >Todos los estados</SelectItem
                                        >
                                        <SelectItem value="active"
                                            >Activas</SelectItem
                                        >
                                        <SelectItem value="inactive"
                                            >Archivadas</SelectItem
                                        >
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </Field>
                    </template>
                </ClientFilterBar>
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
                            <TableCell>
                                {{ item.user_name }}
                            </TableCell>
                            <TableCell>{{ item.career_name }}</TableCell>
                            <TableCell>
                                {{ item.valid_from }} →
                                {{ item.valid_until ?? 'Sin fecha de fin' }}
                            </TableCell>
                            <TableCell>
                                {{ item.active ? 'Activa' : 'Archivada' }}
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
