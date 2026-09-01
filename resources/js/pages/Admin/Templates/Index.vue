<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import ClientFilterBar from '@/components/domain/ClientFilterBar.vue';
import TemplateCreationSheet from '@/components/domain/configuration/TemplateCreationSheet.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useClientFilter } from '@/composables/useClientFilter';
import { useClientPagination } from '@/composables/useClientPagination';
import { index as templatesIndex } from '@/routes/admin/templates';

const props = defineProps<{
    templates: {
        id: string;
        name: string;
        description: string | null;
        active: boolean;
        versions: {
            id: string;
            number: number;
            state: string;
            published_at: string | null;
        }[];
    }[];
    hasInstitutionalTemplate: boolean;
}>();
const filter = useClientFilter(
    () => props.templates,
    (item) => [item.name, item.description],
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

const stateLabel = (state: string): string =>
    state === 'published' ? 'Publicada' : 'Borrador';

defineOptions({
    layout: { breadcrumbs: [{ title: 'Plantillas', href: templatesIndex() }] },
});
</script>

<template>
    <Head title="Plantillas" />
    <PageFrame
        title="Plantillas de sílabo"
        description="El formato del sílabo: qué campos tiene y en qué orden. Publicar una versión nueva no toca las que ya se están usando."
    >
        <template #actions>
            <TemplateCreationSheet v-if="!hasInstitutionalTemplate" />
        </template>

        <div class="flex flex-col gap-4">
            <ClientFilterBar
                :filter="filter"
                input-id="templates-search"
                label="Buscar plantilla"
                placeholder="Buscar por nombre o descripción"
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
                                <SelectValue placeholder="Todos los estados" />
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

            <Card v-if="templatePage.length === 0">
                <CardContent
                    class="py-6 text-center text-sm text-muted-foreground"
                >
                    No existen plantillas.
                </CardContent>
            </Card>

            <div v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Card v-for="template in templatePage" :key="template.id">
                    <CardHeader>
                        <CardTitle>{{ template.name }}</CardTitle>
                        <CardDescription>
                            {{ template.description ?? 'Sin descripción' }}
                        </CardDescription>
                        <CardAction>
                            <Badge
                                :variant="
                                    template.active ? 'secondary' : 'outline'
                                "
                            >
                                {{ template.active ? 'Activa' : 'Archivada' }}
                            </Badge>
                        </CardAction>
                    </CardHeader>
                    <CardContent class="flex-1">
                        <div
                            v-if="template.versions.length > 0"
                            class="flex flex-wrap gap-2"
                        >
                            <Badge
                                v-for="version in template.versions"
                                :key="version.id"
                                :variant="
                                    version.state === 'published'
                                        ? 'secondary'
                                        : 'outline'
                                "
                            >
                                v{{ version.number }} ·
                                {{ stateLabel(version.state) }}
                            </Badge>
                        </div>
                        <p v-else class="text-sm text-muted-foreground">
                            Sin versiones disponibles.
                        </p>
                    </CardContent>
                    <CardFooter v-if="template.versions.length > 0">
                        <Button as-child class="w-full">
                            <Link
                                :href="
                                    TemplateController.show(
                                        template.versions[0].id,
                                    )
                                "
                            >
                                Abrir plantilla
                                <span class="sr-only">{{ template.name }}</span>
                            </Link>
                        </Button>
                    </CardFooter>
                </Card>
            </div>

            <TablePagination
                :meta="templateMeta"
                mode="client"
                label="Paginación de plantillas"
                @update:page="setTemplatePage"
            />
        </div>
    </PageFrame>
</template>
