<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { LockKeyhole, Pencil, Plus, Trash2 } from '@lucide/vue';
import { computed, ref } from 'vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import CareerAcademicEditSheet from '@/components/domain/academic/CareerAcademicEditSheet.vue';
import type {
    CareerAcademicEditableRecord,
    CareerAcademicEntity,
} from '@/components/domain/academic/CareerAcademicEditSheet.vue';
import ParallelCreationSheet from '@/components/domain/academic/ParallelCreationSheet.vue';
import TableActionsMenu from '@/components/domain/TableActionsMenu.vue';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import type { AcademicStructureProps } from '@/types/academic';

const props = withDefaults(
    defineProps<{
        entity: CareerAcademicEntity;
        record: CareerAcademicEditableRecord;
        recordLabel: string;
        editable: boolean;
        active?: boolean;
        editSupported?: boolean;
        deleteSupported?: boolean;
        parallelCreationSupported?: boolean;
        lockedLabel?: string;
        options: AcademicStructureProps['options'];
    }>(),
    {
        active: true,
        editSupported: true,
        deleteSupported: false,
        parallelCreationSupported: false,
        lockedLabel: 'Con historial: este registro queda protegido',
    },
);

const editOpen = ref(false);
const deleteOpen = ref(false);
const parallelCreationOpen = ref(false);
const deletionTitle = computed(() =>
    props.entity === 'programacion_asignatura'
        ? 'Eliminar materia programada'
        : props.entity === 'paralelo'
          ? 'Eliminar paralelo'
          : 'Eliminar asignación docente',
);
const deletionDescription = computed(() =>
    props.entity === 'programacion_asignatura'
        ? 'Se eliminarán también sus paralelos y asignaciones docentes. La operación se rechazará si existe algún sílabo relacionado, para conservar su historial.'
        : 'La operación se rechazará si el registro ya forma parte de un sílabo. Use el relevo docente para cambiar responsables de expedientes existentes.',
);
</script>

<template>
    <div class="flex justify-end">
        <TableActionsMenu :label="`Acciones para ${recordLabel}`">
            <DropdownMenuItem
                v-if="editSupported && editable"
                @select="editOpen = true"
            >
                <Pencil aria-hidden="true" />
                Editar
            </DropdownMenuItem>
            <DropdownMenuItem v-else-if="!editable" disabled>
                <LockKeyhole aria-hidden="true" />
                {{ lockedLabel }}
            </DropdownMenuItem>

            <slot />

            <DropdownMenuItem
                v-if="
                    entity === 'programacion_asignatura' &&
                    parallelCreationSupported
                "
                @select="parallelCreationOpen = true"
            >
                <Plus aria-hidden="true" />
                Agregar paralelo
            </DropdownMenuItem>

            <DropdownMenuItem
                v-if="deleteSupported && editable"
                variant="destructive"
                @select="deleteOpen = true"
            >
                <Trash2 aria-hidden="true" />
                Eliminar
            </DropdownMenuItem>
        </TableActionsMenu>

        <CareerAcademicEditSheet
            v-if="editSupported"
            :key="record.id"
            v-model:open="editOpen"
            :entity="entity"
            :record="record"
            :options="options"
        />

        <ParallelCreationSheet
            v-if="entity === 'programacion_asignatura'"
            :key="`parallel-${record.id}`"
            v-model:open="parallelCreationOpen"
            :scheduled-subject-id="record.id"
            :scheduled-subject-label="recordLabel"
            :parallels="record.parallels ?? []"
        />

        <Dialog v-model:open="deleteOpen">
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{{ deletionTitle }}</DialogTitle>
                    <DialogDescription>
                        {{ deletionDescription }}
                    </DialogDescription>
                </DialogHeader>
                <Form
                    v-bind="
                        entity === 'programacion_asignatura'
                            ? CareerAcademicStructureController.destroyScheduledSubject.form(
                                  record.id,
                              )
                            : CareerAcademicStructureController.destroy.form({
                                  entity,
                                  record: record.id,
                              })
                    "
                    v-slot="{ errors, processing }"
                >
                    <p
                        v-if="
                            errors.scheduledSubject ||
                            errors.record ||
                            errors.process
                        "
                        class="mb-4 text-sm text-destructive"
                    >
                        {{
                            errors.scheduledSubject ||
                            errors.record ||
                            errors.process
                        }}
                    </p>
                    <DialogFooter>
                        <DialogClose as-child>
                            <Button type="button" variant="outline">
                                Cancelar
                            </Button>
                        </DialogClose>
                        <Button
                            type="submit"
                            variant="destructive"
                            :disabled="processing"
                        >
                            <Spinner
                                v-if="processing"
                                data-icon="inline-start"
                            />
                            <Trash2
                                v-else
                                data-icon="inline-start"
                                aria-hidden="true"
                            />
                            {{ deletionTitle }}
                        </Button>
                    </DialogFooter>
                </Form>
            </DialogContent>
        </Dialog>
    </div>
</template>
