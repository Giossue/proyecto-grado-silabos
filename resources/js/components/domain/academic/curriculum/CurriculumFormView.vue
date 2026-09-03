<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { LockKeyhole, Pencil, Trash2 } from '@lucide/vue';
import { computed } from 'vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import TableActionsMenu from '@/components/domain/TableActionsMenu.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
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
import { formatNumericDisplay } from '@/lib/numberDisplay';
import type {
    CurriculumBuilderProps,
    CurriculumBuilderSubject,
} from '@/types/academic';

const props = defineProps<CurriculumBuilderProps>();
const emit = defineEmits<{
    edit: [subject: CurriculumBuilderSubject];
}>();

const subjectById = computed(
    () => new Map(props.subjects.map((subject) => [subject.id, subject])),
);
const {
    items: paginatedSubjects,
    meta: subjectsPagination,
    setPage: setSubjectsPage,
} = useClientPagination(() => props.subjects);
const {
    items: paginatedRequirements,
    meta: requirementsPagination,
    setPage: setRequirementsPage,
} = useClientPagination(() => props.requirements);
</script>

<template>
    <div class="flex flex-col gap-6">
        <Card>
            <CardHeader>
                <CardTitle>Materias de la malla</CardTitle>
                <CardDescription>
                    Desglose completo de materias, ciclos, unidades de
                    organización y campos configurados para esta versión.
                </CardDescription>
            </CardHeader>
            <CardContent class="flex flex-col gap-4">
                <div class="overflow-x-auto">
                    <Table data-cards="true" data-overflows="true">
                        <TableHeader>
                            <TableRow>
                                <TableHead>Materia</TableHead>
                                <TableHead>Ciclo</TableHead>
                                <TableHead>Unidad</TableHead>
                                <TableHead>Modalidad</TableHead>
                                <TableHead
                                    v-for="field in fieldDefinitions"
                                    :key="field.id"
                                    data-card-hidden="true"
                                >
                                    {{ field.label }}
                                </TableHead>
                                <TableHead class="text-right"
                                    >Acciones</TableHead
                                >
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableEmpty
                                v-if="subjects.length === 0"
                                :colspan="4 + fieldDefinitions.length"
                            >
                                No hay materias en esta malla.
                            </TableEmpty>
                            <TableRow
                                v-for="subject in paginatedSubjects"
                                v-else
                                :key="subject.id"
                            >
                                <TableCell>
                                    <div>
                                        {{ subject.name }}
                                    </div>
                                    <div class="text-sm text-muted-foreground">
                                        {{ subject.code }}
                                    </div>
                                </TableCell>
                                <TableCell>{{
                                    subject.cycle ?? '—'
                                }}</TableCell>
                                <TableCell data-card-hidden="true">
                                    {{ subject.organization_unit ?? '—' }}
                                </TableCell>
                                <TableCell data-card-hidden="true">
                                    {{
                                        subject.modality_label ??
                                        career.modality?.label ??
                                        '—'
                                    }}
                                </TableCell>
                                <TableCell
                                    v-for="field in subject.display_fields"
                                    :key="field.id"
                                    data-card-hidden="true"
                                >
                                    {{ formatNumericDisplay(field.value) }}
                                </TableCell>
                                <TableCell class="text-right">
                                    <TableActionsMenu
                                        :label="`Acciones para ${subject.name}`"
                                    >
                                        <DropdownMenuItem
                                            v-if="curriculum.editable"
                                            @select="emit('edit', subject)"
                                        >
                                            <Pencil aria-hidden="true" />
                                            Editar
                                        </DropdownMenuItem>
                                        <DropdownMenuItem v-else disabled>
                                            <LockKeyhole aria-hidden="true" />
                                            Malla sin permiso de edición
                                        </DropdownMenuItem>
                                    </TableActionsMenu>
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
                <TablePagination
                    :meta="subjectsPagination"
                    mode="client"
                    label="Paginación de materias de la malla"
                    @update:page="setSubjectsPage"
                />
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Relaciones</CardTitle>
                <CardDescription>
                    El tipo se conserva explícitamente; el color de una flecha
                    nunca decide su significado.
                </CardDescription>
            </CardHeader>
            <CardContent class="flex flex-col gap-4">
                <div class="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Materia requerida</TableHead>
                                <TableHead>Materia destino</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead class="text-right"
                                    >Acciones</TableHead
                                >
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableEmpty
                                v-if="requirements.length === 0"
                                :colspan="4"
                            >
                                No existen relaciones académicas.
                            </TableEmpty>
                            <TableRow
                                v-for="requirement in paginatedRequirements"
                                v-else
                                :key="requirement.id"
                            >
                                <TableCell>
                                    {{
                                        subjectById.get(
                                            requirement.requirement_id,
                                        )?.name ?? 'Materia no disponible'
                                    }}
                                </TableCell>
                                <TableCell>
                                    {{
                                        subjectById.get(requirement.subject_id)
                                            ?.name ?? 'Materia no disponible'
                                    }}
                                </TableCell>
                                <TableCell>
                                    {{
                                        requirement.type === 'correquisito'
                                            ? 'Correquisito'
                                            : 'Prerrequisito'
                                    }}
                                </TableCell>
                                <TableCell class="text-right">
                                    <TableActionsMenu
                                        :label="`Acciones para la relación hacia ${subjectById.get(requirement.subject_id)?.name ?? 'materia'}`"
                                    >
                                        <Form
                                            v-if="curriculum.editable"
                                            v-bind="
                                                CareerAcademicStructureController.destroySubjectRequirement.form(
                                                    {
                                                        curriculum:
                                                            curriculum.id,
                                                        requirement:
                                                            requirement.id,
                                                    },
                                                )
                                            "
                                            v-slot="{ processing, submit }"
                                        >
                                            <DropdownMenuItem
                                                variant="destructive"
                                                :disabled="processing"
                                                @select="submit()"
                                            >
                                                <Spinner v-if="processing" />
                                                <Trash2
                                                    v-else
                                                    aria-hidden="true"
                                                />
                                                Eliminar relación
                                            </DropdownMenuItem>
                                        </Form>
                                        <DropdownMenuItem v-else disabled>
                                            <LockKeyhole aria-hidden="true" />
                                            Malla sin permiso de edición
                                        </DropdownMenuItem>
                                    </TableActionsMenu>
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
                <TablePagination
                    :meta="requirementsPagination"
                    mode="client"
                    label="Paginación de relaciones académicas"
                    @update:page="setRequirementsPage"
                />
            </CardContent>
        </Card>
    </div>
</template>
