<script setup lang="ts">
import { Form, Link } from '@inertiajs/vue3';
import { ArrowRight, BookOpenCheck, Send } from '@lucide/vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import CareerAcademicActions from '@/components/domain/academic/CareerAcademicActions.vue';
import ClientFilterBar from '@/components/domain/ClientFilterBar.vue';
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
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import {
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useClientFilter } from '@/composables/useClientFilter';
import { useClientPagination } from '@/composables/useClientPagination';
import { show as curriculumShow } from '@/routes/coordination/academic/curricula';
import type { AcademicStructureProps } from '@/types/academic';

const props =
    defineProps<Pick<AcademicStructureProps, 'curricula' | 'options'>>();

const curriculumFilter = useClientFilter(
    () => props.curricula,
    (item) => [item.code, item.career_name, item.state],
    {
        estado: {
            matches: (item, value) => item.state === value,
        },
    },
);

const {
    items: curriculumPage,
    meta: curriculumMeta,
    setPage: setCurriculumPage,
} = useClientPagination(() => curriculumFilter.items.value);

const stateLabel: Record<string, string> = {
    draft: 'Borrador',
    published: 'Publicada',
    inactive: 'Inactiva',
};

const stateVariant = (state: string): 'default' | 'outline' | 'secondary' =>
    state === 'published'
        ? 'default'
        : state === 'draft'
          ? 'secondary'
          : 'outline';

const formatDate = (value: string | null): string =>
    value
        ? new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium' }).format(
              new Date(value),
          )
        : 'Aún no publicada';
</script>

<template>
    <div class="flex flex-col gap-6">
        <ClientFilterBar
            :filter="curriculumFilter"
            input-id="curricula-search"
            label="Buscar malla"
            placeholder="Buscar por código o carrera"
        >
            <template #filters>
                <Field>
                    <FieldLabel for="curricula-search-state" class="sr-only">
                        Estado
                    </FieldLabel>
                    <Select v-model="curriculumFilter.values.estado.value">
                        <SelectTrigger id="curricula-search-state">
                            <SelectValue placeholder="Todos los estados" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                <SelectItem value="all">
                                    Todos los estados
                                </SelectItem>
                                <SelectItem value="draft">Borrador</SelectItem>
                                <SelectItem value="published">
                                    Publicada
                                </SelectItem>
                                <SelectItem value="inactive">
                                    Inactiva
                                </SelectItem>
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                </Field>
            </template>
        </ClientFilterBar>

        <Empty v-if="curriculumPage.length === 0" class="min-h-72 border">
            <EmptyHeader>
                <EmptyMedia variant="icon">
                    <BookOpenCheck aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>
                    {{
                        curriculumFilter.active.value
                            ? 'No hay mallas que coincidan'
                            : 'Todavía no hay mallas'
                    }}
                </EmptyTitle>
                <EmptyDescription>
                    {{
                        curriculumFilter.active.value
                            ? 'Cambie o limpie los filtros para volver a ver las mallas de esta carrera.'
                            : 'Cree la primera versión de malla para agregar sus materias, campos y relaciones.'
                    }}
                </EmptyDescription>
            </EmptyHeader>
        </Empty>

        <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card v-for="item in curriculumPage" :key="item.id">
                <CardHeader>
                    <CardTitle>{{ item.code }}</CardTitle>
                    <CardDescription>
                        {{ item.career_name }} · Versión
                        {{ item.version_number }}
                    </CardDescription>
                    <CardAction>
                        <CareerAcademicActions
                            entity="curriculum"
                            :record="item"
                            :record-label="`la malla ${item.code}`"
                            :editable="item.editable"
                            :status-supported="false"
                            locked-label="Malla publicada e inmutable"
                            :options="options"
                        >
                            <Form
                                v-if="item.state === 'draft'"
                                v-bind="
                                    CareerAcademicStructureController.publishCurriculum.form(
                                        item.id,
                                    )
                                "
                                v-slot="{ errors, processing, submit }"
                            >
                                <DropdownMenuItem
                                    :disabled="
                                        processing || item.subject_count === 0
                                    "
                                    @select="submit()"
                                >
                                    <Spinner v-if="processing" />
                                    <Send v-else aria-hidden="true" />
                                    Publicar malla
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    v-if="errors.curriculum"
                                    disabled
                                    variant="destructive"
                                >
                                    {{ errors.curriculum }}
                                </DropdownMenuItem>
                            </Form>
                        </CareerAcademicActions>
                    </CardAction>
                </CardHeader>
                <CardContent>
                    <dl class="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <dt class="text-muted-foreground">Estado</dt>
                            <dd class="mt-1">
                                <Badge :variant="stateVariant(item.state)">
                                    {{ stateLabel[item.state] ?? item.state }}
                                </Badge>
                            </dd>
                        </div>
                        <div>
                            <dt class="text-muted-foreground">Materias</dt>
                            <dd class="mt-1 font-medium">
                                {{ item.subject_count }}
                            </dd>
                        </div>
                        <div class="col-span-2">
                            <dt class="text-muted-foreground">Publicación</dt>
                            <dd class="mt-1 font-medium">
                                {{ formatDate(item.published_at) }}
                            </dd>
                        </div>
                    </dl>
                </CardContent>
                <CardFooter>
                    <Button as-child class="w-full">
                        <Link :href="curriculumShow(item.id)">
                            Ver desglose y constructor
                            <ArrowRight
                                data-icon="inline-end"
                                aria-hidden="true"
                            />
                        </Link>
                    </Button>
                </CardFooter>
            </Card>
        </div>

        <TablePagination
            :meta="curriculumMeta"
            mode="client"
            label="Paginación de versiones de malla"
            @update:page="setCurriculumPage"
        />
    </div>
</template>
