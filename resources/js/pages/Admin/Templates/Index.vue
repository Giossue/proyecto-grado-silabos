<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { FileStack } from '@lucide/vue';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import ClientFilterBar from '@/components/domain/ClientFilterBar.vue';
import TemplateCreationSheet from '@/components/domain/configuration/TemplateCreationSheet.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
import { Button } from '@/components/ui/button';
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
import { index as templatesIndex } from '@/routes/admin/templates';

const props = defineProps<{
    templates: {
        id: string;
        name: string;
        description: string | null;
        career_name: string | null;
        active: boolean;
        versions: {
            id: string;
            number: number;
            state: string;
            published_at: string | null;
        }[];
    }[];
    careers: { id: string; nombre: string }[];
}>();
const filter = useClientFilter(
    () => props.templates,
    (item) => [item.name, item.description, item.career_name],
    {
        estado: {
            matches: (item, value) => item.active === (value === 'active'),
        },
    },
);

const {
    items: templatePage,
    meta: templateMeta,
    setPage: setTemplatePage,
} = useClientPagination(() => filter.items.value);

defineOptions({
    layout: { breadcrumbs: [{ title: 'Plantillas', href: templatesIndex() }] },
});
</script>

<template>
    <Head title="Plantillas" />
    <PageFrame
        :icon="FileStack"
        title="Plantillas de sílabo"
        description="Diseñe versiones tipadas y publíquelas sin alterar las ya usadas."
    >
        <template #actions>
            <TemplateCreationSheet :careers="careers" />
        </template>

        <Card>
            <CardContent class="flex flex-col gap-4">
                <ClientFilterBar
                    v-model="filter.search.value"
                    input-id="templates-search"
                    label="Buscar plantilla"
                    placeholder="Buscar por nombre, descripción o carrera"
                >
                    <template #filters>
                        <Field>
                            <FieldLabel
                                for="templates-search-state"
                                class="sr-only"
                            >
                                Estado
                            </FieldLabel>
                            <Select v-model="filter.values.estado.value">
                                <SelectTrigger id="templates-search-state">
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
                            ><TableHead>Plantilla</TableHead
                            ><TableHead>Alcance</TableHead
                            ><TableHead>Versiones</TableHead
                            ><TableHead>Estado</TableHead></TableRow
                        ></TableHeader
                    ><TableBody>
                        <TableEmpty
                            v-if="templatePage.length === 0"
                            :colspan="4"
                            >No existen plantillas.</TableEmpty
                        >
                        <TableRow
                            v-for="template in templatePage"
                            v-else
                            :key="template.id"
                            ><TableCell
                                ><div class="font-medium">
                                    {{ template.name }}
                                </div>
                                <div
                                    class="max-w-xl text-sm text-muted-foreground"
                                >
                                    {{
                                        template.description ??
                                        'Sin descripción'
                                    }}
                                </div></TableCell
                            ><TableCell>{{
                                template.career_name ?? 'General'
                            }}</TableCell
                            ><TableCell
                                ><div class="flex flex-wrap gap-2">
                                    <Button
                                        v-for="version in template.versions"
                                        :key="version.id"
                                        as-child
                                        size="sm"
                                        variant="outline"
                                        ><Link
                                            :href="
                                                TemplateController.show(
                                                    version.id,
                                                )
                                            "
                                            >v{{ version.number }}</Link
                                        ></Button
                                    >
                                </div></TableCell
                            ><TableCell>{{
                                template.active ? 'Activa' : 'Archivada'
                            }}</TableCell></TableRow
                        >
                    </TableBody></Table
                ><TablePagination
                    :meta="templateMeta"
                    mode="client"
                    label="Paginación de plantillas"
                    @update:page="setTemplatePage"
            /></CardContent>
        </Card>
    </PageFrame>
</template>
