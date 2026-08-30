<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { LockKeyhole, Send } from '@lucide/vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import RecordStatusForm from '@/components/domain/academic/RecordStatusForm.vue';
import ClientFilterBar from '@/components/domain/ClientFilterBar.vue';
import TableActionsMenu from '@/components/domain/TableActionsMenu.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
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
    Pick<AcademicStructureProps, 'curricula' | 'subjects'> & {
        section: 'curricula' | 'subjects';
    }
>();
const curriculumFilter = useClientFilter(
    () => props.curricula,
    (item) => [item.code, item.career_name, item.state],
    {
        // Una malla no se archiva: recorre borrador, publicada e inactiva.
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
const subjectFilter = useClientFilter(
    () => props.subjects,
    (item) => [item.code, item.name, item.curriculum_code, item.career_name],
    {
        estado: {
            matches: (item, value) => item.active === (value === 'active'),
        },
    },
);

const {
    items: subjectPage,
    meta: subjectMeta,
    setPage: setSubjectPage,
} = useClientPagination(() => subjectFilter.items.value);

const stateLabel: Record<string, string> = {
    draft: 'Borrador',
    published: 'Publicada',
    inactive: 'Inactiva',
};
</script>

<template>
    <div class="flex flex-col gap-6">
        <Card v-if="section === 'curricula'">
            <CardContent class="flex flex-col gap-4">
                <ClientFilterBar
                    :filter="curriculumFilter"
                    input-id="curricula-search"
                    label="Buscar malla"
                    placeholder="Buscar por código o carrera"
                >
                    <template #filters>
                        <Field>
                            <FieldLabel
                                for="curricula-search-state"
                                class="sr-only"
                                >Estado</FieldLabel
                            >
                            <Select
                                v-model="curriculumFilter.values.estado.value"
                            >
                                <SelectTrigger id="curricula-search-state">
                                    <SelectValue
                                        placeholder="Todos los estados"
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem value="all"
                                            >Todos los estados</SelectItem
                                        >
                                        <SelectItem value="draft"
                                            >Borrador</SelectItem
                                        >
                                        <SelectItem value="published"
                                            >Publicada</SelectItem
                                        >
                                        <SelectItem value="inactive"
                                            >Inactiva</SelectItem
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
                            ><TableHead>Malla</TableHead
                            ><TableHead>Carrera</TableHead
                            ><TableHead>Materias</TableHead
                            ><TableHead>Estado</TableHead
                            ><TableHead class="text-right"
                                >Acciones</TableHead
                            ></TableRow
                        ></TableHeader
                    ><TableBody>
                        <TableEmpty
                            v-if="curricula.length === 0"
                            :colspan="5"
                            >{{
                                curriculumFilter.active.value
                                    ? 'Ninguna malla coincide con la búsqueda.'
                                    : 'No existen mallas.'
                            }}</TableEmpty
                        >
                        <TableRow
                            v-for="item in curriculumPage"
                            v-else
                            :key="item.id"
                            ><TableCell
                                ><div class="font-medium">{{ item.code }}</div>
                                <div class="text-sm text-muted-foreground">
                                    Versión {{ item.version_number }}
                                </div></TableCell
                            ><TableCell>{{ item.career_name }}</TableCell
                            ><TableCell>{{ item.subject_count }}</TableCell
                            ><TableCell>{{
                                stateLabel[item.state] ?? item.state
                            }}</TableCell
                            ><TableCell class="text-right"
                                ><TableActionsMenu
                                    :label="`Acciones para la malla ${item.code}`"
                                    ><Form
                                        v-if="item.state === 'draft'"
                                        v-bind="
                                            CareerAcademicStructureController.publishCurriculum.form(
                                                item.id,
                                            )
                                        "
                                        v-slot="{ errors, processing, submit }"
                                        ><DropdownMenuItem
                                            :disabled="
                                                processing ||
                                                item.subject_count === 0
                                            "
                                            @select="submit()"
                                            ><Spinner v-if="processing" /><Send
                                                v-else
                                                aria-hidden="true"
                                            />Publicar malla</DropdownMenuItem
                                        ><DropdownMenuItem
                                            v-if="errors.curriculum"
                                            disabled
                                            variant="destructive"
                                            >{{
                                                errors.curriculum
                                            }}</DropdownMenuItem
                                        ></Form
                                    ><DropdownMenuItem v-else disabled
                                        ><LockKeyhole aria-hidden="true" />Malla
                                        publicada e inmutable</DropdownMenuItem
                                    ></TableActionsMenu
                                ></TableCell
                            ></TableRow
                        >
                    </TableBody></Table
                >
                <TablePagination
                    :meta="curriculumMeta"
                    mode="client"
                    label="Paginación de versiones de malla"
                    @update:page="setCurriculumPage"
                />
            </CardContent>
        </Card>

        <Card v-if="section === 'subjects'">
            <CardContent class="flex flex-col gap-4">
                <ClientFilterBar
                    :filter="subjectFilter"
                    input-id="subjects-search"
                    label="Buscar asignatura"
                    placeholder="Buscar por código, nombre o malla"
                >
                    <template #filters>
                        <Field>
                            <FieldLabel
                                for="subjects-search-state"
                                class="sr-only"
                                >Estado</FieldLabel
                            >
                            <Select v-model="subjectFilter.values.estado.value">
                                <SelectTrigger id="subjects-search-state">
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
                            ><TableHead>Materia</TableHead
                            ><TableHead>Malla</TableHead
                            ><TableHead>Ciclo</TableHead
                            ><TableHead>Carga</TableHead
                            ><TableHead>Estado</TableHead
                            ><TableHead class="text-right"
                                >Acciones</TableHead
                            ></TableRow
                        ></TableHeader
                    ><TableBody>
                        <TableEmpty v-if="subjects.length === 0" :colspan="6"
                            >No existen materias.</TableEmpty
                        >
                        <TableRow
                            v-for="item in subjectPage"
                            v-else
                            :key="item.id"
                            ><TableCell
                                ><div class="font-medium">{{ item.name }}</div>
                                <div class="text-sm text-muted-foreground">
                                    {{ item.code }}
                                </div></TableCell
                            ><TableCell
                                >{{ item.curriculum_code }} ·
                                {{ item.career_name }}</TableCell
                            ><TableCell>{{ item.cycle ?? '—' }}</TableCell
                            ><TableCell
                                >{{ item.credits ?? '—' }} créditos ·
                                {{ item.total_hours ?? '—' }} h</TableCell
                            ><TableCell>{{
                                item.active ? 'Activa' : 'Archivada'
                            }}</TableCell
                            ><TableCell class="text-right"
                                ><TableActionsMenu
                                    :label="`Acciones para ${item.name}`"
                                    ><RecordStatusForm
                                        display="menu"
                                        scope="career"
                                        entity="subject"
                                        :record-id="item.id"
                                        :active="
                                            item.active
                                        " /></TableActionsMenu></TableCell
                        ></TableRow> </TableBody
                ></Table>
                <TablePagination
                    :meta="subjectMeta"
                    mode="client"
                    label="Paginación de materias por malla"
                    @update:page="setSubjectPage"
                />
            </CardContent>
        </Card>
    </div>
</template>
