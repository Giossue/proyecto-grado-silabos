<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { LibraryBig } from '@lucide/vue';
import ClientFilterBar from '@/components/domain/ClientFilterBar.vue';
import AcademicSourceCreationSheet from '@/components/domain/configuration/AcademicSourceCreationSheet.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
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
import { index as sourcesIndex, show as sourceShow } from '@/routes/sources';

const props = defineProps<{
    sources: {
        id: string;
        name: string;
        type: string;
        authority: string;
        responsible: string;
        career_name: string;
        active: boolean;
        versions: {
            id: string;
            number: number;
            state: string;
            valid_from: string | null;
            valid_until: string | null;
        }[];
    }[];
    careers: { id: string; nombre: string }[];
    isAdministrator: boolean;
}>();
const filter = useClientFilter(
    () => props.sources,
    (item) => [
        item.name,
        item.type,
        item.authority,
        item.responsible,
        item.career_name,
    ],
    {
        estado: {
            matches: (item, value) => item.active === (value === 'active'),
        },
    },
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
        :icon="LibraryBig"
        title="Fuentes académicas"
        description="Versione evidencia con autoridad, vigencia, fragmentos y huellas verificables."
    >
        <template #actions>
            <AcademicSourceCreationSheet
                :careers="careers"
                :is-administrator="isAdministrator"
            />
        </template>
        <Card>
            <CardContent class="flex flex-col gap-4">
                <ClientFilterBar
                    :filter="filter"
                    input-id="sources-search"
                    label="Buscar fuente"
                    placeholder="Buscar por nombre, tipo, autoridad o responsable"
                >
                    <template #filters>
                        <Field>
                            <FieldLabel
                                for="sources-search-state"
                                class="sr-only"
                            >
                                Estado
                            </FieldLabel>
                            <Select v-model="filter.values.estado.value">
                                <SelectTrigger id="sources-search-state">
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
                            ><TableHead>Fuente</TableHead
                            ><TableHead>Autoridad y responsable</TableHead
                            ><TableHead>Carrera</TableHead
                            ><TableHead>Versiones</TableHead></TableRow
                        ></TableHeader
                    ><TableBody>
                        <TableEmpty v-if="sourcePage.length === 0" :colspan="4"
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
                                <div class="text-sm text-muted-foreground">
                                    {{ source.type }}
                                </div></TableCell
                            ><TableCell
                                ><div>{{ source.authority }}</div>
                                <div class="text-sm text-muted-foreground">
                                    {{ source.responsible }}
                                </div></TableCell
                            ><TableCell>{{ source.career_name }}</TableCell
                            ><TableCell
                                ><!--
                                    Una versión por línea. En fila, sin la caja que las
                                    separaba, «v1 · Activa v2 · Borrador» se leía como una
                                    sola frase.
                                -->
                                <div class="flex flex-col gap-1">
                                    <span
                                        v-for="version in source.versions"
                                        :key="version.id"
                                        >v{{ version.number }} ·
                                        {{
                                            version.state === 'active'
                                                ? 'Activa'
                                                : version.state === 'draft'
                                                  ? 'Borrador'
                                                  : 'Reemplazada'
                                        }}</span
                                    >
                                </div></TableCell
                            ></TableRow
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
