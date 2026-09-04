<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { LockKeyhole, Pencil, Trash2 } from '@lucide/vue';
import { computed, ref } from 'vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import CareerAcademicEditSheet from '@/components/domain/academic/CareerAcademicEditSheet.vue';
import type {
    CareerAcademicEditableRecord,
    CareerAcademicEntity,
} from '@/components/domain/academic/CareerAcademicEditSheet.vue';
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
        deleteSupported?: boolean;
        lockedLabel?: string;
        options: AcademicStructureProps['options'];
    }>(),
    {
        active: true,
        deleteSupported: false,
        lockedLabel: 'Con historial: este registro queda protegido',
    },
);

const editOpen = ref(false);
const deleteOpen = ref(false);
const deletionTitle = computed(() =>
    props.entity === 'oferta'
        ? 'Eliminar oferta académica'
        : props.entity === 'paralelo'
          ? 'Eliminar paralelo'
          : 'Eliminar asignación docente',
);
const deletionDescription = computed(() =>
    props.entity === 'oferta'
        ? 'Se eliminarán también sus paralelos y asignaciones docentes. La operación se rechazará si existe algún sílabo relacionado, para conservar su historial.'
        : 'La operación se rechazará si el registro ya forma parte de un sílabo. Use el relevo docente para cambiar responsables de expedientes existentes.',
);
</script>

<template>
    <div class="flex justify-end">
        <TableActionsMenu :label="`Acciones para ${recordLabel}`">
            <DropdownMenuItem v-if="editable" @select="editOpen = true">
                <Pencil aria-hidden="true" />
                Editar
            </DropdownMenuItem>
            <DropdownMenuItem v-else disabled>
                <LockKeyhole aria-hidden="true" />
                {{ lockedLabel }}
            </DropdownMenuItem>

            <slot />

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
            :key="record.id"
            v-model:open="editOpen"
            :entity="entity"
            :record="record"
            :options="options"
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
                        entity === 'oferta'
                            ? CareerAcademicStructureController.destroyOffering.form(
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
                        v-if="errors.offering || errors.record || errors.process"
                        class="mb-4 text-sm text-destructive"
                    >
                        {{ errors.offering || errors.record || errors.process }}
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
                            <Spinner v-if="processing" />
                            {{ deletionTitle }}
                        </Button>
                    </DialogFooter>
                </Form>
            </DialogContent>
        </Dialog>
    </div>
</template>
