<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import ClientFilterBar from '@/components/domain/ClientFilterBar.vue';
import AcademicSourceCreationSheet from '@/components/domain/configuration/AcademicSourceCreationSheet.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
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
import { useClientFilter } from '@/composables/useClientFilter';
import { useClientPagination } from '@/composables/useClientPagination';
import { index as sourcesIndex, show as sourceShow } from '@/routes/sources';

const props = defineProps<{
    sources: {
        id: string;
        name: string;
        description: string | null;
        has_content: boolean;
        actualizado_en: string | null;
    }[];
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
            <AcademicSourceCreationSheet />
        </template>
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
                            ><TableHead
                                >Última actualización</TableHead
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
                                ><Link
                                    :href="sourceShow(source.id)"
                                    class="font-medium underline-offset-4 hover:underline"
                                    >{{ source.name }}</Link
                                >
                                <div
                                    v-if="source.description"
                                    class="max-w-md truncate text-sm text-muted-foreground"
                                >
                                    {{ source.description }}
                                </div></TableCell
                            ><TableCell
                                ><Badge
                                    :variant="
                                        source.has_content
                                            ? 'secondary'
                                            : 'outline'
                                    "
                                    >{{
                                        source.has_content
                                            ? 'Redactado'
                                            : 'Sin contenido'
                                    }}</Badge
                                ></TableCell
                            ><TableCell>{{
                                source.actualizado_en ?? '—'
                            }}</TableCell></TableRow
                        >
                    </TableBody></Table
                ><TablePagination
                    :meta="sourceMeta"
                    mode="client"
                    label="Paginación de fuentes académicas"
                    @update:page="setSourcePage"
            /></CardContent>
        </Card>
    </PageFrame>
</template>
