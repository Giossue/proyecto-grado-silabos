<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { LockKeyhole, Send } from '@lucide/vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import RecordStatusForm from '@/components/domain/academic/RecordStatusForm.vue';
import TableActionsMenu from '@/components/domain/TableActionsMenu.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
import { Badge } from '@/components/ui/badge';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
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
import { useClientPagination } from '@/composables/useClientPagination';
import type { AcademicStructureProps } from '@/types/academic';

const props =
    defineProps<Pick<AcademicStructureProps, 'curricula' | 'subjects'>>();
const {
    items: curriculumPage,
    meta: curriculumMeta,
    setPage: setCurriculumPage,
} = useClientPagination(() => props.curricula);
const {
    items: subjectPage,
    meta: subjectMeta,
    setPage: setSubjectPage,
} = useClientPagination(() => props.subjects);

const stateLabel: Record<string, string> = {
    draft: 'Borrador',
    published: 'Publicada',
    inactive: 'Inactiva',
};
</script>

<template>
    <div class="flex flex-col gap-6">
        <Card>
            <CardHeader
                ><CardTitle>Versiones de malla</CardTitle
                ><CardDescription
                    >Publicar fija la versión y sus materias para usos
                    históricos.</CardDescription
                ></CardHeader
            >
            <CardContent class="flex flex-col gap-4">
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
                        <TableEmpty v-if="curricula.length === 0" :colspan="5"
                            >No existen mallas.</TableEmpty
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
                            ><TableCell
                                ><Badge
                                    :variant="
                                        item.state === 'published'
                                            ? 'secondary'
                                            : 'outline'
                                    "
                                    >{{
                                        stateLabel[item.state] ?? item.state
                                    }}</Badge
                                ></TableCell
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

        <Card>
            <CardHeader
                ><CardTitle>Materias por malla</CardTitle
                ><CardDescription
                    >Los códigos se interpretan dentro de su
                    malla.</CardDescription
                ></CardHeader
            >
            <CardContent class="flex flex-col gap-4">
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
                            ><TableCell
                                ><Badge
                                    :variant="
                                        item.active ? 'secondary' : 'outline'
                                    "
                                    >{{
                                        item.active ? 'Activa' : 'Archivada'
                                    }}</Badge
                                ></TableCell
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
