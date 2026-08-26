<script setup lang="ts">
import RecordStatusForm from '@/components/domain/academic/RecordStatusForm.vue';
import TableActionsMenu from '@/components/domain/TableActionsMenu.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
import { Badge } from '@/components/ui/badge';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
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
    defineProps<Pick<AcademicStructureProps, 'offerings' | 'parallels'>>();
const {
    items: offeringPage,
    meta: offeringMeta,
    setPage: setOfferingPage,
} = useClientPagination(() => props.offerings);
const {
    items: parallelPage,
    meta: parallelMeta,
    setPage: setParallelPage,
} = useClientPagination(() => props.parallels);
</script>

<template>
    <div class="flex flex-col gap-6">
        <Card>
            <CardHeader
                ><CardTitle>Ofertas académicas</CardTitle
                ><CardDescription
                    >Una combinación idéntica no puede
                    duplicarse.</CardDescription
                ></CardHeader
            >
            <CardContent class="flex flex-col gap-4"
                ><Table
                    ><TableHeader
                        ><TableRow
                            ><TableHead>Materia</TableHead
                            ><TableHead>Periodo</TableHead
                            ><TableHead>Ubicación</TableHead
                            ><TableHead>Paralelos</TableHead
                            ><TableHead>Estado</TableHead
                            ><TableHead class="text-right"
                                >Acciones</TableHead
                            ></TableRow
                        ></TableHeader
                    ><TableBody>
                        <TableEmpty v-if="offerings.length === 0" :colspan="6"
                            >No existen ofertas.</TableEmpty
                        >
                        <TableRow
                            v-for="item in offeringPage"
                            v-else
                            :key="item.id"
                            ><TableCell class="font-medium">{{
                                item.label
                            }}</TableCell
                            ><TableCell>{{ item.period_name }}</TableCell
                            ><TableCell
                                >{{ item.campus_name }} ·
                                {{ item.modality_name }}</TableCell
                            ><TableCell>{{ item.parallel_count }}</TableCell
                            ><TableCell
                                ><Badge
                                    :variant="
                                        item.active ? 'secondary' : 'outline'
                                    "
                                    >{{
                                        item.active ? 'Activa' : 'Archivada'
                                    }}</Badge
                                ></TableCell
                            ><TableCell class="text-right"
                                ><TableActionsMenu
                                    :label="`Acciones para ${item.label}`"
                                    ><RecordStatusForm
                                        display="menu"
                                        scope="career"
                                        entity="offering"
                                        :record-id="item.id"
                                        :active="
                                            item.active
                                        " /></TableActionsMenu></TableCell
                        ></TableRow> </TableBody></Table
                ><TablePagination
                    :meta="offeringMeta"
                    mode="client"
                    label="Paginación de ofertas académicas"
                    @update:page="setOfferingPage"
            /></CardContent>
        </Card>

        <Card>
            <CardHeader
                ><CardTitle>Paralelos</CardTitle
                ><CardDescription
                    >Se conservan aunque su oferta quede
                    archivada.</CardDescription
                ></CardHeader
            >
            <CardContent class="flex flex-col gap-4"
                ><Table
                    ><TableHeader
                        ><TableRow
                            ><TableHead>Oferta</TableHead
                            ><TableHead>Paralelo</TableHead
                            ><TableHead>Estado</TableHead
                            ><TableHead class="text-right"
                                >Acciones</TableHead
                            ></TableRow
                        ></TableHeader
                    ><TableBody>
                        <TableEmpty v-if="parallels.length === 0" :colspan="4"
                            >No existen paralelos.</TableEmpty
                        >
                        <TableRow
                            v-for="item in parallelPage"
                            v-else
                            :key="item.id"
                            ><TableCell>{{ item.offering_label }}</TableCell
                            ><TableCell class="font-medium">{{
                                item.code
                            }}</TableCell
                            ><TableCell
                                ><Badge
                                    :variant="
                                        item.active ? 'secondary' : 'outline'
                                    "
                                    >{{
                                        item.active ? 'Activo' : 'Archivado'
                                    }}</Badge
                                ></TableCell
                            ><TableCell class="text-right"
                                ><TableActionsMenu
                                    :label="`Acciones para el paralelo ${item.code}`"
                                    ><RecordStatusForm
                                        display="menu"
                                        scope="career"
                                        entity="parallel"
                                        :record-id="item.id"
                                        :active="
                                            item.active
                                        " /></TableActionsMenu></TableCell
                        ></TableRow> </TableBody></Table
                ><TablePagination
                    :meta="parallelMeta"
                    mode="client"
                    label="Paginación de paralelos"
                    @update:page="setParallelPage"
            /></CardContent>
        </Card>
    </div>
</template>
