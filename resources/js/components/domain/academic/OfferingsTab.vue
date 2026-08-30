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

const props = defineProps<
    Pick<AcademicStructureProps, 'offerings' | 'parallels'> & {
        section: 'offerings' | 'parallels';
    }
>();
const offeringFilter = useClientFilter(
    () => props.offerings,
    (item) => [
        item.label,
        item.period_name,
        item.campus_name,
        item.modality_name,
    ],
    {
        estado: {
            matches: (item, value) => item.active === (value === 'active'),
        },
    },
);

const {
    items: offeringPage,
    meta: offeringMeta,
    setPage: setOfferingPage,
} = useClientPagination(() => offeringFilter.items.value);
const parallelFilter = useClientFilter(
    () => props.parallels,
    (item) => [item.code, item.offering_label],
    {
        estado: {
            matches: (item, value) => item.active === (value === 'active'),
        },
    },
);

const {
    items: parallelPage,
    meta: parallelMeta,
    setPage: setParallelPage,
} = useClientPagination(() => parallelFilter.items.value);
</script>

<template>
    <div class="flex flex-col gap-6">
        <Card v-if="section === 'offerings'">
            <CardContent class="flex flex-col gap-4">
                <ClientFilterBar
                    :filter="offeringFilter"
                    input-id="offerings-search"
                    label="Buscar oferta"
                    placeholder="Buscar por asignatura, periodo, campus o modalidad"
                >
                    <template #filters>
                        <Field>
                            <FieldLabel
                                for="offerings-search-state"
                                class="sr-only"
                                >Estado</FieldLabel
                            >
                            <Select
                                v-model="offeringFilter.values.estado.value"
                            >
                                <SelectTrigger id="offerings-search-state">
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
                <Table
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
                            ><TableCell>{{
                                item.active ? 'Activa' : 'Archivada'
                            }}</TableCell
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

        <Card v-if="section === 'parallels'">
            <CardContent class="flex flex-col gap-4">
                <ClientFilterBar
                    :filter="parallelFilter"
                    input-id="parallels-search"
                    label="Buscar paralelo"
                    placeholder="Buscar por código u oferta"
                >
                    <template #filters>
                        <Field>
                            <FieldLabel
                                for="parallels-search-state"
                                class="sr-only"
                                >Estado</FieldLabel
                            >
                            <Select
                                v-model="parallelFilter.values.estado.value"
                            >
                                <SelectTrigger id="parallels-search-state">
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
                                            >Activos</SelectItem
                                        >
                                        <SelectItem value="inactive"
                                            >Archivados</SelectItem
                                        >
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </Field>
                    </template>
                </ClientFilterBar>
                <Table
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
                            ><TableCell>{{
                                item.active ? 'Activo' : 'Archivado'
                            }}</TableCell
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
