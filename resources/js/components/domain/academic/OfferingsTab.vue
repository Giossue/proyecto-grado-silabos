<script setup lang="ts">
import CareerAcademicActions from '@/components/domain/academic/CareerAcademicActions.vue';
import ClientFilterBar from '@/components/domain/ClientFilterBar.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
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
import { useClientFilter } from '@/composables/useClientFilter';
import { useClientPagination } from '@/composables/useClientPagination';
import type { AcademicStructureProps } from '@/types/academic';

const props = defineProps<
    Pick<AcademicStructureProps, 'offerings' | 'options'> & {
        lockReason?: string | null;
    }
>();
const dateFormatter = new Intl.DateTimeFormat('es-EC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
});
const formatPeriod = (startsOn: string, endsOn: string): string =>
    [
        dateFormatter.format(new Date(startsOn + 'T00:00:00Z')),
        dateFormatter.format(new Date(endsOn + 'T00:00:00Z')),
    ].join(' – ');
const offeringFilter = useClientFilter(
    () => props.offerings,
    (item) => [
        item.subject_name,
        item.subject_code,
        formatPeriod(item.period_starts_on, item.period_ends_on),
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
</script>

<template>
    <Card>
        <CardContent class="flex flex-col gap-4">
            <ClientFilterBar
                :filter="offeringFilter"
                input-id="offerings-search"
                label="Buscar oferta"
                placeholder="Buscar por materia, código, periodo, campus o modalidad"
            />
            <Table
                ><TableHeader
                    ><TableRow
                        ><TableHead>Materia</TableHead
                        ><TableHead>Código</TableHead
                        ><TableHead>Periodo</TableHead
                        ><TableHead>Ubicación</TableHead
                        ><TableHead>Paralelos</TableHead
                        ><TableHead class="text-right"
                            >Acciones</TableHead
                        ></TableRow
                    ></TableHeader
                ><TableBody>
                    <TableEmpty v-if="offerings.length === 0" :colspan="6"
                        >No existen ofertas.</TableEmpty
                    >
                    <TableRow v-for="item in offeringPage" v-else :key="item.id"
                        ><TableCell>{{ item.subject_name }}</TableCell
                        ><TableCell>{{ item.subject_code }}</TableCell
                        ><TableCell>{{
                            formatPeriod(
                                item.period_starts_on,
                                item.period_ends_on,
                            )
                        }}</TableCell
                        ><TableCell
                            >{{ item.campus_name }} ·
                            {{ item.modality_name }}</TableCell
                        ><TableCell>{{ item.parallel_count }}</TableCell
                        ><TableCell class="text-right"
                            ><CareerAcademicActions
                                entity="oferta"
                                :record="item"
                                :record-label="item.label"
                                :editable="item.editable"
                                :active="item.active"
                                :delete-supported="!lockReason"
                                :parallel-creation-supported="
                                    !lockReason && item.active
                                "
                                :locked-label="lockReason ?? undefined"
                                :options="options" /></TableCell
                    ></TableRow> </TableBody></Table
            ><TablePagination
                :meta="offeringMeta"
                mode="client"
                label="Paginación de ofertas académicas"
                @update:page="setOfferingPage"
        /></CardContent>
    </Card>
</template>
