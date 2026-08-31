<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Settings2, Trash2 } from '@lucide/vue';
import { ref } from 'vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
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
import {
    DropdownMenuItem,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import type { CurriculumBuilderProps } from '@/types/academic';

defineProps<Pick<CurriculumBuilderProps, 'curriculum'>>();
const emit = defineEmits<{ configure: [] }>();

const deleteOpen = ref(false);
</script>

<template>
    <div class="flex flex-wrap items-center gap-2">
        <TableActionsMenu :label="`Acciones para la malla ${curriculum.code}`">
            <DropdownMenuItem @select="emit('configure')">
                <Settings2 aria-hidden="true" />
                Configurar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <RecordStatusForm
                display="menu"
                scope="career"
                entity="curriculum"
                :record-id="curriculum.id"
                :active="curriculum.active"
            />
            <DropdownMenuItem variant="destructive" @select="deleteOpen = true">
                <Trash2 aria-hidden="true" />
                Eliminar
            </DropdownMenuItem>
        </TableActionsMenu>

        <Dialog v-model:open="deleteOpen">
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Eliminar malla</DialogTitle>
                    <DialogDescription>
                        Esta acción solo se completará si la malla no tiene
                        ofertas ni sílabos relacionados. Si ya tiene historial,
                        debe deshabilitarla.
                    </DialogDescription>
                </DialogHeader>

                <Form
                    v-bind="
                        CareerAcademicStructureController.destroyCurriculum.form(
                            curriculum.id,
                        )
                    "
                    v-slot="{ errors, processing }"
                >
                    <p
                        v-if="errors.curriculum"
                        class="mb-4 text-sm text-destructive"
                    >
                        {{ errors.curriculum }}
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
                            Eliminar malla
                        </Button>
                    </DialogFooter>
                </Form>
            </DialogContent>
        </Dialog>
    </div>
</template>
