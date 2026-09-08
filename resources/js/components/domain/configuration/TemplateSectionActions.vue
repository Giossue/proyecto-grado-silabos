<script setup lang="ts">
import { useForm } from '@inertiajs/vue3';
import { MoreHorizontal, Pencil, Trash2 } from '@lucide/vue';
import { ref } from 'vue';
import { toast } from 'vue-sonner';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import type { TemplateSection } from '@/types/configuration';

const props = defineProps<{
    templateId: string;
    section: TemplateSection;
}>();

const editOpen = ref(false);
const deleteOpen = ref(false);
const form = useForm({ title: props.section.title });

const openEdit = (): void => {
    form.clearErrors();
    form.title = props.section.title;
    editOpen.value = true;
};

const save = (): void => {
    form.patch(
        TemplateController.updateSection.url({
            template: props.templateId,
            section: props.section.id,
        }),
        {
            preserveScroll: true,
            onSuccess: () => {
                toast.success('Bloque actualizado.');
                editOpen.value = false;
            },
            onError: (errors) => {
                if (!('purge_required' in errors)) {
                    toast.error(
                        Object.values(errors)[0] ??
                            'No se pudo actualizar el bloque.',
                    );
                }
            },
        },
    );
};

const destroy = (): void => {
    form.delete(
        TemplateController.destroySection.url({
            template: props.templateId,
            section: props.section.id,
        }),
        {
            preserveScroll: true,
            onSuccess: () => {
                toast.success('Bloque eliminado.');
                deleteOpen.value = false;
            },
            onError: (errors) => {
                if (!('purge_required' in errors)) {
                    toast.error(
                        Object.values(errors)[0] ??
                            'No se pudo eliminar el bloque.',
                    );
                }
            },
        },
    );
};
</script>

<template>
    <Tooltip>
        <TooltipTrigger as-child>
            <span class="inline-flex">
                <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            class="size-7 text-foreground"
                            :aria-label="`Acciones del bloque ${section.title}`"
                        >
                            <MoreHorizontal aria-hidden="true" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem @select="openEdit">
                            <Pencil aria-hidden="true" />
                            Editar bloque
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            variant="destructive"
                            @select="deleteOpen = true"
                        >
                            <Trash2 aria-hidden="true" />
                            Eliminar bloque
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </span>
        </TooltipTrigger>
        <TooltipContent paper> Acciones del bloque </TooltipContent>
    </Tooltip>

    <Dialog v-model:open="editOpen">
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Editar bloque</DialogTitle>
                <DialogDescription>
                    El bloque agrupa los campos que completará el docente.
                </DialogDescription>
            </DialogHeader>
            <form class="flex flex-col gap-4" @submit.prevent="save">
                <FieldGroup>
                    <Field :data-invalid="Boolean(form.errors.title)">
                        <FieldLabel for="edit-template-section-title" required>
                            Nombre del bloque
                        </FieldLabel>
                        <Input
                            id="edit-template-section-title"
                            v-model="form.title"
                            maxlength="180"
                            placeholder="Ej. Objetivos de la asignatura"
                            :disabled="form.processing"
                            :aria-invalid="Boolean(form.errors.title)"
                        />
                        <FieldError
                            v-if="form.errors.title"
                            :errors="[form.errors.title]"
                        />
                    </Field>
                </FieldGroup>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        :disabled="form.processing"
                        @click="editOpen = false"
                    >
                        Cancelar
                    </Button>
                    <Button type="submit" :disabled="form.processing">
                        Guardar bloque
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    </Dialog>

    <Dialog v-model:open="deleteOpen">
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Eliminar bloque</DialogTitle>
                <DialogDescription>
                    Se quitará «{{ section.title }}» con sus
                    {{ section.blocks.length }} campos. Los sílabos entregados
                    conservan su copia.
                </DialogDescription>
            </DialogHeader>
            <DialogFooter>
                <Button
                    type="button"
                    variant="outline"
                    :disabled="form.processing"
                    @click="deleteOpen = false"
                >
                    Cancelar
                </Button>
                <Button
                    type="button"
                    variant="destructive"
                    :disabled="form.processing"
                    @click="destroy"
                >
                    Eliminar bloque
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
