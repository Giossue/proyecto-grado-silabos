<script setup lang="ts">
import { useForm } from '@inertiajs/vue3';
import { MoreHorizontal, Pencil, Save, Trash2 } from '@lucide/vue';
import { computed, ref } from 'vue';
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
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from '@/lib/toast';
import type {
    TemplateContentType,
    TemplateFieldContainer,
} from '@/types/configuration';

type EditableContentType = Exclude<
    TemplateContentType,
    'institutional' | 'flow'
>;

const props = defineProps<{
    templateId: string;
    sectionTitle: string;
    field: TemplateFieldContainer;
    blockTypes: { value: EditableContentType; label: string }[];
}>();

const primary = computed(() => props.field.fields[0] ?? null);
const editOpen = ref(false);
const deleteOpen = ref(false);
const form = useForm({
    block_id: props.field.id,
    key: '',
    label: '',
    content_type: 'text' as TemplateContentType,
    help: '',
    required: true,
    inherited: false,
    master_source: '',
    teacher_editable: true,
    ai_enabled: false,
    document_marker: '',
    document: null as TemplateFieldContainer['document'],
    fingerprint: '',
});

const title = computed(() => props.field.title);
const typeCanChange = computed(
    () => !props.field.document && !primary.value?.inherited,
);

const openEdit = (): void => {
    const value = primary.value;

    if (!value) {
        return;
    }

    form.clearErrors();
    form.block_id = props.field.id;
    form.key = value.key;
    form.label = props.field.title;
    form.content_type = value.content_type;
    form.help = value.help ?? '';
    form.required = Boolean(value.required);
    form.inherited = Boolean(value.inherited);
    form.master_source = value.master_source ?? '';
    form.teacher_editable = Boolean(value.teacher_editable);
    form.ai_enabled = Boolean(value.ai_enabled);
    form.document_marker = value.document_marker ?? '';
    form.document = props.field.document ?? null;
    form.fingerprint = props.field.fingerprint ?? '';
    editOpen.value = true;
};

const save = (): void => {
    const value = primary.value;

    if (!value) {
        return;
    }

    const url = props.field.document
        ? TemplateController.updateDocument.url({
              template: props.templateId,
              block: props.field.id,
          })
        : TemplateController.updateField.url({
              template: props.templateId,
              field: value.id,
          });

    form.patch(url, {
        preserveScroll: true,
        onSuccess: () => {
            toast.success('Campo actualizado.');
            editOpen.value = false;
        },
        onError: (errors) => {
            if (!('purge_required' in errors)) {
                toast.error(
                    Object.values(errors)[0] ??
                        'No se pudo actualizar el campo.',
                );
            }
        },
    });
};

const destroy = (): void => {
    form.delete(
        TemplateController.destroyBlock.url({
            template: props.templateId,
            block: props.field.id,
        }),
        {
            preserveScroll: true,
            onSuccess: () => {
                toast.success('Campo eliminado.');
                deleteOpen.value = false;
            },
            onError: (errors) => {
                if (!('purge_required' in errors)) {
                    toast.error(
                        Object.values(errors)[0] ??
                            'No se pudo eliminar el campo.',
                    );
                }
            },
        },
    );
};

defineExpose({
    openEdit,
    openDelete: () => {
        deleteOpen.value = true;
    },
});
</script>

<template>
    <Tooltip v-if="primary" :disable-hoverable-content="true">
        <TooltipTrigger as-child>
            <span class="inline-flex">
                <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            class="size-7 text-foreground"
                            :aria-label="`Acciones del campo ${title}`"
                        >
                            <MoreHorizontal aria-hidden="true" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem @select="openEdit">
                            <Pencil aria-hidden="true" />
                            Editar campo
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            variant="destructive"
                            @select="deleteOpen = true"
                        >
                            <Trash2 aria-hidden="true" />
                            Eliminar campo
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </span>
        </TooltipTrigger>
        <TooltipContent paper side="left" :side-offset="8">
            Acciones del campo
        </TooltipContent>
    </Tooltip>

    <Dialog v-model:open="editOpen">
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Editar campo</DialogTitle>
                <DialogDescription>
                    Ajuste cómo se presenta y qué deberá completar el docente.
                </DialogDescription>
            </DialogHeader>
            <form class="flex flex-col gap-4" @submit.prevent="save">
                <FieldGroup>
                    <Field :data-invalid="Boolean(form.errors.label)">
                        <FieldLabel for="edit-template-field-label" required>
                            Nombre del campo
                        </FieldLabel>
                        <Input
                            id="edit-template-field-label"
                            v-model="form.label"
                            maxlength="180"
                            placeholder="Ej. Objetivo general"
                            :disabled="form.processing"
                            :aria-invalid="Boolean(form.errors.label)"
                        />
                        <FieldError
                            v-if="form.errors.label"
                            :errors="[form.errors.label]"
                        />
                    </Field>

                    <Field :data-invalid="Boolean(form.errors.content_type)">
                        <FieldLabel
                            for="edit-template-field-content-type"
                            required
                        >
                            Tipo de contenido
                        </FieldLabel>
                        <Select
                            v-model="form.content_type"
                            :disabled="form.processing || !typeCanChange"
                        >
                            <SelectTrigger
                                id="edit-template-field-content-type"
                                class="w-full"
                                :aria-invalid="
                                    Boolean(form.errors.content_type)
                                "
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="type in blockTypes"
                                        :key="type.value"
                                        :value="type.value"
                                    >
                                        {{ type.label }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldDescription v-if="!typeCanChange">
                            El tipo queda fijo porque este campo ya tiene un
                            diseño propio o es heredado.
                        </FieldDescription>
                        <FieldError
                            v-if="form.errors.content_type"
                            :errors="[form.errors.content_type]"
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
                        <Spinner
                            v-if="form.processing"
                            data-icon="inline-start"
                        />
                        <Save
                            v-else
                            data-icon="inline-start"
                            aria-hidden="true"
                        />
                        Guardar campo
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    </Dialog>

    <Dialog v-model:open="deleteOpen">
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Eliminar campo</DialogTitle>
                <DialogDescription>
                    Se quitará «{{ title }}» de «{{ sectionTitle }}». Los
                    sílabos entregados conservan su copia.
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
                    <Spinner v-if="form.processing" data-icon="inline-start" />
                    <Trash2
                        v-else
                        data-icon="inline-start"
                        aria-hidden="true"
                    />
                    Eliminar campo
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
