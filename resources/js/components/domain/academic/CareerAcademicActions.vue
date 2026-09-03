<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { LockKeyhole, Pencil, Trash2 } from '@lucide/vue';
import { ref } from 'vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import CareerAcademicEditSheet from '@/components/domain/academic/CareerAcademicEditSheet.vue';
import type {
    CareerAcademicEditableRecord,
    CareerAcademicEntity,
} from '@/components/domain/academic/CareerAcademicEditSheet.vue';
import RecordStatusForm from '@/components/domain/academic/RecordStatusForm.vue';
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

withDefaults(
    defineProps<{
        entity: CareerAcademicEntity;
        record: CareerAcademicEditableRecord;
        recordLabel: string;
        editable: boolean;
        active?: boolean;
        statusSupported?: boolean;
        deleteSupported?: boolean;
        lockedLabel?: string;
        options: AcademicStructureProps['options'];
    }>(),
    {
        active: true,
        statusSupported: true,
        deleteSupported: false,
        lockedLabel: 'Con historial: archive y cree otro registro',
    },
);

const editOpen = ref(false);
const deleteOpen = ref(false);
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

            <RecordStatusForm
                v-if="statusSupported"
                display="menu"
                scope="career"
                :entity="entity"
                :record-id="record.id"
                :active="active"
            />
            <DropdownMenuItem
                v-if="deleteSupported && entity === 'oferta'"
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
                    <DialogTitle>Eliminar oferta académica</DialogTitle>
                    <DialogDescription>
                        Se eliminarán también sus paralelos y asignaciones
                        docentes. La operación se rechazará si existe algún
                        sílabo relacionado, para conservar su historial.
                    </DialogDescription>
                </DialogHeader>
                <Form
                    v-bind="
                        CareerAcademicStructureController.destroyOffering.form(
                            record.id,
                        )
                    "
                    v-slot="{ errors, processing }"
                >
                    <p
                        v-if="errors.offering"
                        class="mb-4 text-sm text-destructive"
                    >
                        {{ errors.offering }}
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
                            Eliminar oferta
                        </Button>
                    </DialogFooter>
                </Form>
            </DialogContent>
        </Dialog>
    </div>
</template>
