<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3';
import { Lock } from '@lucide/vue';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import ClientFilterBar from '@/components/domain/ClientFilterBar.vue';
import TemplateCreationSheet from '@/components/domain/configuration/TemplateCreationSheet.vue';
import PageFrame from '@/components/domain/PageFrame.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
        sections_count: number;
        actualizado_en: string | null;
    }[];
    hasInstitutionalTemplate: boolean;
    /** Motivo por el que la plantilla no se edita; nulo cuando sí se puede. */
    processLock: string | null;
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

const formatDate = (value: string): string =>
    new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium' }).format(
        new Date(value),
    );

defineOptions({
    layout: { breadcrumbs: [{ title: 'Plantillas', href: templatesIndex() }] },
});
</script>

<template>
    <Head title="Plantillas" />
    <PageFrame
        title="Plantillas de sílabo"
        description="El formato del sílabo: qué campos tiene y en qué orden. Se edita en el sitio; cada sílabo entregado conserva su propia copia."
    >
        <template #actions>
            <TemplateCreationSheet
                v-if="!hasInstitutionalTemplate && !processLock"
            />
        </template>

        <div class="flex flex-col gap-4">
            <Alert v-if="processLock">
                <Lock aria-hidden="true" />
                <AlertTitle>Plantilla protegida durante el proceso</AlertTitle>
                <AlertDescription>{{ processLock }}</AlertDescription>
            </Alert>
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
                        <p class="text-sm text-muted-foreground">
                            {{ template.sections_count }} secciones
                            <template v-if="template.actualizado_en">
                                · actualizada el
                                {{ formatDate(template.actualizado_en) }}
                            </template>
                        </p>
                    </CardContent>
                    <CardFooter>
                        <Button as-child class="w-full">
                            <Link :href="TemplateController.show(template.id)">
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
