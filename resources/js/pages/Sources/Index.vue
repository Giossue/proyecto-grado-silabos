<script setup lang="ts">
import { Head } from '@inertiajs/vue3';
import ClientFilterBar from '@/components/domain/ClientFilterBar.vue';
import AcademicSourceActions from '@/components/domain/configuration/AcademicSourceActions.vue';
import AcademicSourceCreationSheet from '@/components/domain/configuration/AcademicSourceCreationSheet.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import ProcessLockAlert from '@/components/domain/ProcessLockAlert.vue';
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
import { index as sourcesIndex } from '@/routes/sources';

const props = defineProps<{
    sources: {
        id: string;
        name: string;
        description: string | null;
        internal_notes: string | null;
        has_content: boolean;
    }[];
    /** Motivo por el que no se editan las fuentes; nulo cuando sí se puede. */
    processLock: string | null;
}>();
const filter = useClientFilter(
    () => props.sources,
    (item) => [item.name, item.description ?? ''],
);

const {
    items: sourcePage,
    meta: sourceMeta,
    setPage: setSourcePage,
} = useClientPagination(() => filter.items.value);

defineOptions({
    layout: {
        breadcrumbs: [{ title: 'Fuentes académicas', href: sourcesIndex() }],
    },
});
</script>

<template>
    <Head title="Fuentes académicas" />
    <PageFrame
        title="Fuentes académicas"
        description="Los documentos que la coordinación entrega a los docentes como apoyo para elaborar sus sílabos."
    >
        <template #actions>
            <AcademicSourceCreationSheet v-if="!processLock" />
        </template>
        <ProcessLockAlert
            v-if="processLock"
            title="Fuentes protegidas durante la convocatoria"
            :reason="processLock"
        />
        <Card>
            <CardContent class="flex flex-col gap-4">
                <ClientFilterBar
                    :filter="filter"
                    input-id="sources-search"
                    label="Buscar fuente"
                    placeholder="Buscar por nombre o descripción" />
                <Table
                    ><TableHeader
                        ><TableRow
                            ><TableHead>Fuente</TableHead
                            ><TableHead>Contenido</TableHead
                            ><TableHead class="text-right"
                                >Acciones</TableHead
                            ></TableRow
                        ></TableHeader
                    ><TableBody>
                        <TableEmpty v-if="sourcePage.length === 0" :colspan="3"
                            >No existen fuentes.</TableEmpty
                        >
                        <TableRow
                            v-for="source in sourcePage"
                            v-else
                            :key="source.id"
                            ><TableCell
                                ><div>{{ source.name }}</div>
                                <div
                                    v-if="source.description"
                                    class="max-w-md truncate text-sm text-muted-foreground"
                                >
                                    {{ source.description }}
                                </div></TableCell
                            ><TableCell>{{
                                source.has_content
                                    ? 'Redactado'
                                    : 'Sin contenido'
                            }}</TableCell
                            ><TableCell class="text-right"
                                ><AcademicSourceActions
                                    :source="source"
                                    :locked="Boolean(processLock)" /></TableCell
                        ></TableRow> </TableBody></Table
                ><TablePagination
                    :meta="sourceMeta"
                    mode="client"
                    label="Paginación de fuentes académicas"
                    @update:page="setSourcePage"
            /></CardContent>
        </Card>
    </PageFrame>
</template>
