<script setup lang="ts">
import { computed } from 'vue';
import CatalogActions from '@/components/domain/academic/CatalogActions.vue';
import ClientFilterBar from '@/components/domain/ClientFilterBar.vue';
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
import type {
    AcademicStructureProps,
    GovernanceSection,
} from '@/types/academic';

const props = defineProps<
    Pick<AcademicStructureProps, 'catalogs'> & {
        section: GovernanceSection;
    }
>();

const facultyNames = computed(
    () =>
        new Map(
            props.catalogs.faculties.map((faculty) => [
                faculty.id,
                faculty.nombre,
            ]),
        ),
);

const careerCount = (facultyId: string): number =>
    props.catalogs.careers.filter((career) => career.faculty_id === facultyId)
        .length;

const facultyName = (facultyId: string): string =>
    facultyNames.value.get(facultyId) ?? 'Facultad no disponible';

const facultyFilter = useClientFilter(
    () => props.catalogs.faculties,
    (item) => [item.nombre, item.codigo_institucional, item.codigo],
    {
        estado: {
            matches: (item, value) => item.activo === (value === 'active'),
        },
    },
);

const {
    items: facultyPage,
    meta: facultyMeta,
    setPage: setFacultyPage,
} = useClientPagination(() => facultyFilter.items.value);
const careerFilter = useClientFilter(
    () => props.catalogs.careers,
    (item) => [item.name, item.code],
    {
        estado: {
            matches: (item, value) => item.active === (value === 'active'),
        },
    },
);

const {
    items: careerPage,
    meta: careerMeta,
    setPage: setCareerPage,
} = useClientPagination(() => careerFilter.items.value);
const campusFilter = useClientFilter(
    () => props.catalogs.campuses,
    (item) => [item.nombre, item.codigo_institucional, item.codigo],
    {
        estado: {
            matches: (item, value) => item.activo === (value === 'active'),
        },
    },
);

const {
    items: campusPage,
    meta: campusMeta,
    setPage: setCampusPage,
} = useClientPagination(() => campusFilter.items.value);
const modalityFilter = useClientFilter(
    () => props.catalogs.modalities,
    (item) => [item.nombre, item.codigo_institucional, item.codigo],
    {
        estado: {
            matches: (item, value) => item.activo === (value === 'active'),
        },
    },
);

const {
    items: modalityPage,
    meta: modalityMeta,
    setPage: setModalityPage,
} = useClientPagination(() => modalityFilter.items.value);
const periodFilter = useClientFilter(
    () => props.catalogs.periods,
    (item) => [item.name, item.code],
    {
        estado: {
            matches: (item, value) => item.active === (value === 'active'),
        },
    },
);

const {
    items: periodPage,
    meta: periodMeta,
    setPage: setPeriodPage,
} = useClientPagination(() => periodFilter.items.value);
</script>

<template>
    <Card v-if="section === 'faculties'">
        <CardContent class="flex flex-col gap-4">
            <ClientFilterBar
                :filter="facultyFilter"
                input-id="faculties-search"
                label="Buscar facultad"
                placeholder="Buscar por nombre o código"
            >
                <template #filters>
                    <Field>
                        <FieldLabel for="faculties-search-state" class="sr-only"
                            >Estado</FieldLabel
                        >
                        <Select v-model="facultyFilter.values.estado.value">
                            <SelectTrigger id="faculties-search-state">
                                <SelectValue placeholder="Todos los estados" />
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
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Facultad</TableHead>
                        <TableHead>Código institucional</TableHead>
                        <TableHead>Carreras relacionadas</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead class="text-right">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableEmpty
                        v-if="catalogs.faculties.length === 0"
                        :colspan="5"
                    >
                        No existen facultades registradas.
                    </TableEmpty>
                    <TableRow
                        v-for="faculty in facultyPage"
                        v-else
                        :key="faculty.id"
                    >
                        <TableCell>
                            {{ faculty.nombre }}
                        </TableCell>
                        <TableCell>
                            {{
                                faculty.codigo_institucional ||
                                'Sin código institucional'
                            }}
                        </TableCell>
                        <TableCell>
                            {{ careerCount(faculty.id) }}
                        </TableCell>
                        <TableCell>
                            {{ faculty.activo ? 'Activa' : 'Archivada' }}
                        </TableCell>
                        <TableCell class="text-right">
                            <CatalogActions
                                entity="facultad"
                                :record-id="faculty.id"
                                :record-name="faculty.nombre"
                                :record-code="
                                    faculty.codigo_institucional ?? null
                                "
                                :active="faculty.activo"
                                :logo-url="faculty.logo_url"
                                :faculties="catalogs.faculties"
                            />
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>
            <TablePagination
                :meta="facultyMeta"
                mode="client"
                label="Paginación de facultades"
                @update:page="setFacultyPage"
            />
        </CardContent>
    </Card>

    <Card v-else-if="section === 'careers'">
        <CardContent class="flex flex-col gap-4">
            <ClientFilterBar
                :filter="careerFilter"
                input-id="careers-search"
                label="Buscar carrera"
                placeholder="Buscar por nombre o código"
            >
                <template #filters>
                    <Field>
                        <FieldLabel for="careers-search-state" class="sr-only"
                            >Estado</FieldLabel
                        >
                        <Select v-model="careerFilter.values.estado.value">
                            <SelectTrigger id="careers-search-state">
                                <SelectValue placeholder="Todos los estados" />
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
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Carrera</TableHead>
                        <TableHead>Facultad</TableHead>
                        <TableHead>Modalidad</TableHead>
                        <TableHead>Código institucional</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead class="text-right">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableEmpty
                        v-if="catalogs.careers.length === 0"
                        :colspan="6"
                    >
                        No existen carreras registradas.
                    </TableEmpty>
                    <TableRow
                        v-for="career in careerPage"
                        v-else
                        :key="career.id"
                    >
                        <TableCell>
                            {{ career.name }}
                        </TableCell>
                        <TableCell>
                            {{ facultyName(career.faculty_id) }}
                        </TableCell>
                        <TableCell>
                            {{ career.modality_name ?? 'Sin modalidad' }}
                        </TableCell>
                        <TableCell>
                            {{ career.code || 'Sin código institucional' }}
                        </TableCell>
                        <TableCell>
                            {{ career.active ? 'Activa' : 'Archivada' }}
                        </TableCell>
                        <TableCell class="text-right">
                            <CatalogActions
                                entity="carrera"
                                :record-id="career.id"
                                :record-name="career.name"
                                :record-code="career.code"
                                :active="career.active"
                                :faculty-id="career.faculty_id"
                                :modality-id="career.modality_id"
                                :faculties="catalogs.faculties"
                                :modalities="catalogs.modalities"
                            />
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>
            <TablePagination
                :meta="careerMeta"
                mode="client"
                label="Paginación de carreras"
                @update:page="setCareerPage"
            />
        </CardContent>
    </Card>

    <Card v-else-if="section === 'campuses'">
        <CardContent class="flex flex-col gap-4">
            <ClientFilterBar
                :filter="campusFilter"
                input-id="campuses-search"
                label="Buscar campus"
                placeholder="Buscar por nombre o código"
            >
                <template #filters>
                    <Field>
                        <FieldLabel for="campuses-search-state" class="sr-only"
                            >Estado</FieldLabel
                        >
                        <Select v-model="campusFilter.values.estado.value">
                            <SelectTrigger id="campuses-search-state">
                                <SelectValue placeholder="Todos los estados" />
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
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Campus</TableHead>
                        <TableHead>Código institucional</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead class="text-right">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableEmpty
                        v-if="catalogs.campuses.length === 0"
                        :colspan="4"
                    >
                        No existen campus registrados.
                    </TableEmpty>
                    <TableRow
                        v-for="campus in campusPage"
                        v-else
                        :key="campus.id"
                    >
                        <TableCell>
                            {{ campus.nombre }}
                        </TableCell>
                        <TableCell>
                            {{
                                campus.codigo_institucional ||
                                'Sin código institucional'
                            }}
                        </TableCell>
                        <TableCell>
                            {{ campus.activo ? 'Activo' : 'Archivado' }}
                        </TableCell>
                        <TableCell class="text-right">
                            <CatalogActions
                                entity="campus"
                                :record-id="campus.id"
                                :record-name="campus.nombre"
                                :record-code="
                                    campus.codigo_institucional ?? null
                                "
                                :active="campus.activo"
                                :faculties="catalogs.faculties"
                            />
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>
            <TablePagination
                :meta="campusMeta"
                mode="client"
                label="Paginación de campus"
                @update:page="setCampusPage"
            />
        </CardContent>
    </Card>

    <Card v-else-if="section === 'modalities'">
        <CardContent class="flex flex-col gap-4">
            <ClientFilterBar
                :filter="modalityFilter"
                input-id="modalities-search"
                label="Buscar modalidad"
                placeholder="Buscar por nombre o código"
            >
                <template #filters>
                    <Field>
                        <FieldLabel
                            for="modalities-search-state"
                            class="sr-only"
                            >Estado</FieldLabel
                        >
                        <Select v-model="modalityFilter.values.estado.value">
                            <SelectTrigger id="modalities-search-state">
                                <SelectValue placeholder="Todos los estados" />
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
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Modalidad</TableHead>
                        <TableHead>Código estable</TableHead>
                        <TableHead>Alcance</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead class="text-right">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableEmpty
                        v-if="catalogs.modalities.length === 0"
                        :colspan="5"
                    >
                        No existen modalidades registradas.
                    </TableEmpty>
                    <TableRow
                        v-for="modality in modalityPage"
                        v-else
                        :key="modality.id"
                    >
                        <TableCell>
                            {{ modality.nombre }}
                        </TableCell>
                        <TableCell>
                            {{ modality.codigo || 'Sin código' }}
                        </TableCell>
                        <TableCell>
                            {{
                                modality.combina_por_asignatura
                                    ? 'Por materia'
                                    : 'Toda la carrera'
                            }}
                        </TableCell>
                        <TableCell>
                            {{ modality.activo ? 'Activa' : 'Archivada' }}
                        </TableCell>
                        <TableCell class="text-right">
                            <CatalogActions
                                entity="modalidad"
                                :record-id="modality.id"
                                :record-name="modality.nombre"
                                :record-code="modality.codigo ?? null"
                                :active="modality.activo"
                                :per-subject="modality.combina_por_asignatura"
                                :faculties="catalogs.faculties"
                            />
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>
            <TablePagination
                :meta="modalityMeta"
                mode="client"
                label="Paginación de modalidades"
                @update:page="setModalityPage"
            />
        </CardContent>
    </Card>

    <Card v-else>
        <CardContent class="flex flex-col gap-4">
            <ClientFilterBar
                :filter="periodFilter"
                input-id="periods-search"
                label="Buscar periodo"
                placeholder="Buscar por nombre o código"
            >
                <template #filters>
                    <Field>
                        <FieldLabel for="periods-search-state" class="sr-only"
                            >Estado</FieldLabel
                        >
                        <Select v-model="periodFilter.values.estado.value">
                            <SelectTrigger id="periods-search-state">
                                <SelectValue placeholder="Todos los estados" />
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
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Periodo</TableHead>
                        <TableHead>Código estable</TableHead>
                        <TableHead>Fechas</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead class="text-right">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableEmpty
                        v-if="catalogs.periods.length === 0"
                        :colspan="5"
                    >
                        No existen periodos académicos registrados.
                    </TableEmpty>
                    <TableRow
                        v-for="period in periodPage"
                        v-else
                        :key="period.id"
                    >
                        <TableCell>
                            {{ period.name }}
                        </TableCell>
                        <TableCell>{{ period.code }}</TableCell>
                        <TableCell>
                            <time :datetime="period.starts_on">
                                {{ period.starts_on }}
                            </time>
                            →
                            <time :datetime="period.ends_on">
                                {{ period.ends_on }}
                            </time>
                        </TableCell>
                        <TableCell>
                            {{ period.active ? 'Activo' : 'Archivado' }}
                        </TableCell>
                        <TableCell class="text-right">
                            <CatalogActions
                                entity="periodo"
                                :record-id="period.id"
                                :record-name="period.name"
                                :record-code="period.code"
                                :active="period.active"
                                :starts-on="period.starts_on"
                                :ends-on="period.ends_on"
                                :faculties="catalogs.faculties"
                            />
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>
            <TablePagination
                :meta="periodMeta"
                mode="client"
                label="Paginación de periodos académicos"
                @update:page="setPeriodPage"
            />
        </CardContent>
    </Card>
</template>
