<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { LibraryBig } from '@lucide/vue';
import AcademicSourceController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/AcademicSourceController';
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
import { useClientPagination } from '@/composables/useClientPagination';
import { index as sourcesIndex } from '@/routes/sources';

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
const {
    items: sourcePage,
    meta: sourceMeta,
    setPage: setSourcePage,
} = useClientPagination(() => props.sources);

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
            <CardContent class="flex flex-col gap-4"
                ><Table
                    ><TableHeader
                        ><TableRow
                            ><TableHead>Fuente</TableHead
                            ><TableHead>Autoridad y responsable</TableHead
                            ><TableHead>Carrera</TableHead
                            ><TableHead>Versiones</TableHead></TableRow
                        ></TableHeader
                    ><TableBody>
                        <TableEmpty v-if="sources.length === 0" :colspan="4"
                            >No existen fuentes.</TableEmpty
                        >
                        <TableRow
                            v-for="source in sourcePage"
                            v-else
                            :key="source.id"
                            ><TableCell
                                ><Link
                                    :href="
                                        AcademicSourceController.show(source.id)
                                    "
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
                                ><div class="flex flex-wrap gap-2">
                                    <Badge
                                        v-for="version in source.versions"
                                        :key="version.id"
                                        :variant="
                                            version.state === 'active'
                                                ? 'secondary'
                                                : 'outline'
                                        "
                                        >v{{ version.number }} ·
                                        {{
                                            version.state === 'active'
                                                ? 'Activa'
                                                : version.state === 'draft'
                                                  ? 'Borrador'
                                                  : 'Reemplazada'
                                        }}</Badge
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
