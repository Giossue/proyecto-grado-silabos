<script setup lang="ts">
import { useForm } from '@inertiajs/vue3';
import { Blocks, Plus, Trash2 } from '@lucide/vue';
import { ref } from 'vue';
import { toast } from 'vue-sonner';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import TemplateIconPopover from '@/components/domain/configuration/TemplateIconPopover.vue';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PopoverContent } from '@/components/ui/popover';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import type { TemplateContentType } from '@/types/configuration';

type EditableContentType = Exclude<
    TemplateContentType,
    'institutional' | 'flow'
>;

const props = withDefaults(
    defineProps<{
        templateId: string;
        position: number;
        blockTypes: { value: EditableContentType; label: string }[];
        empty?: boolean;
        menu?: boolean;
        ribbon?: boolean;
        inline?: boolean;
        choice?: boolean;
    }>(),
    {
        empty: false,
        menu: false,
        ribbon: false,
        inline: false,
        choice: false,
    },
);

let sequence = 0;
const technicalKey = (prefix: string): string => {
    sequence += 1;

    return `${prefix}_${Date.now().toString(36)}_${sequence}`;
};

const newField = () => ({
    key: technicalKey('campo'),
    label: '',
    content_type: 'text' as EditableContentType,
});

const open = ref(false);
const emit = defineEmits<{ closed: [] }>();
const form = useForm({
    title: '',
    key: technicalKey('bloque'),
    position: props.position + 1,
    fields: [newField()],
});

const reset = (): void => {
    form.clearErrors();
    form.title = '';
    form.key = technicalKey('bloque');
    form.position = props.position + 1;
    form.fields = [newField()];
};

const addField = (): void => {
    if (form.fields.length >= 20) {
        return;
    }

    form.fields.push(newField());
};

const removeField = (index: number): void => {
    if (form.fields.length === 1) {
        return;
    }

    form.fields.splice(index, 1);
};

const errorFor = (path: string): string | undefined =>
    (form.errors as Record<string, string>)[path];

const submit = (): void => {
    form.position = props.position + 1;
    form.post(TemplateController.storeSection.url(props.templateId), {
        preserveScroll: true,
        onSuccess: () => {
            toast.success('Bloque agregado.');
            open.value = false;
            reset();
            emit('closed');
        },
        onError: (errors) => {
            if (!('purge_required' in errors)) {
                toast.error(
                    Object.values(errors)[0] ?? 'No se pudo agregar el bloque.',
                );
            }
        },
    });
};

const updateOpen = (value: boolean): void => {
    open.value = value;

    if (!value && !form.processing) {
        reset();
        emit('closed');
    }
};
</script>

<template>
    <component
        :is="menu ? Dialog : TemplateIconPopover"
        :open="open"
        v-bind="
            menu
                ? {}
                : {
                      label: empty ? 'Agregar primer bloque' : 'Agregar bloque',
                      variant: empty ? 'default' : choice ? 'ghost' : 'outline',
                      size: empty
                          ? 'icon'
                          : inline
                            ? 'icon-sm'
                            : ribbon || choice
                              ? 'sm'
                              : 'icon-sm',
                      showLabel: ribbon || choice,
                      tooltipSide: inline ? 'bottom' : 'left',
                      buttonClass: inline
                          ? 'size-5 rounded-full p-0 opacity-100 transition-transform hover:scale-125 focus-visible:scale-125'
                          : choice
                            ? 'w-full justify-start'
                            : empty
                              ? undefined
                              : ribbon
                                ? undefined
                                : 'size-7 border-dashed bg-background',
                  }
        "
        @update:open="updateOpen"
    >
        <template v-if="menu">
            <DialogTrigger as-child>
                <DropdownMenuItem @select.prevent>
                    <Blocks aria-hidden="true" />
                    Agregar bloque
                </DropdownMenuItem>
            </DialogTrigger>
        </template>
        <template #icon>
            <Plus v-if="!menu && inline" aria-hidden="true" />
            <Blocks v-else-if="!menu" aria-hidden="true" />
        </template>
        <component
            :is="menu ? DialogContent : PopoverContent"
            v-bind="
                menu
                    ? {}
                    : { align: empty ? 'center' : choice ? 'start' : 'end' }
            "
            :class="
                menu
                    ? 'max-h-[calc(100vh-2rem)] w-[min(30rem,calc(100vw-2rem))] overflow-hidden p-0'
                    : 'max-h-[var(--reka-popover-content-available-height)] w-[min(30rem,calc(100vw-2rem))] overflow-hidden p-0'
            "
        >
            <DialogTitle v-if="menu" class="sr-only">
                Nuevo bloque
            </DialogTitle>
            <DialogDescription v-if="menu" class="sr-only">
                El bloque agrupa los campos que completará el docente.
            </DialogDescription>
            <form
                :class="
                    menu
                        ? 'flex max-h-[calc(100vh-2rem)] flex-col'
                        : 'flex max-h-[var(--reka-popover-content-available-height)] flex-col'
                "
                @submit.prevent="submit"
            >
                <div class="flex flex-col gap-1 border-b px-4 py-3">
                    <p class="font-medium">Nuevo bloque</p>
                    <p class="text-sm text-muted-foreground">
                        El bloque agrupa los campos que completará el docente.
                    </p>
                </div>

                <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                    <FieldGroup>
                        <Field :data-invalid="Boolean(errorFor('title'))">
                            <FieldLabel for="new-template-block-title" required>
                                Nombre del bloque
                            </FieldLabel>
                            <Input
                                id="new-template-block-title"
                                v-model="form.title"
                                maxlength="180"
                                placeholder="Ej. Objetivos de la asignatura"
                                :disabled="form.processing"
                                :aria-invalid="Boolean(errorFor('title'))"
                            />
                            <FieldError
                                v-if="errorFor('title')"
                                :errors="[errorFor('title')]"
                            />
                        </Field>

                        <FieldGroup
                            v-for="(field, index) in form.fields"
                            :key="field.key"
                            class="gap-3 rounded-lg border p-3"
                        >
                            <div
                                class="flex items-center justify-between gap-2"
                            >
                                <p class="text-sm font-medium">
                                    Campo {{ index + 1 }}
                                </p>
                                <Button
                                    v-if="form.fields.length > 1"
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    :disabled="form.processing"
                                    :aria-label="`Quitar campo ${index + 1}`"
                                    @click="removeField(index)"
                                >
                                    <Trash2 aria-hidden="true" />
                                </Button>
                            </div>

                            <Field
                                :data-invalid="
                                    Boolean(errorFor(`fields.${index}.label`))
                                "
                            >
                                <FieldLabel
                                    :for="`new-template-field-${index}`"
                                    required
                                >
                                    Nombre
                                </FieldLabel>
                                <Input
                                    :id="`new-template-field-${index}`"
                                    v-model="field.label"
                                    maxlength="180"
                                    placeholder="Ej. Objetivo general"
                                    :disabled="form.processing"
                                    :aria-invalid="
                                        Boolean(
                                            errorFor(`fields.${index}.label`),
                                        )
                                    "
                                />
                                <FieldError
                                    v-if="errorFor(`fields.${index}.label`)"
                                    :errors="[
                                        errorFor(`fields.${index}.label`),
                                    ]"
                                />
                            </Field>

                            <Field
                                :data-invalid="
                                    Boolean(
                                        errorFor(
                                            `fields.${index}.content_type`,
                                        ),
                                    )
                                "
                            >
                                <FieldLabel
                                    :for="`new-template-field-type-${index}`"
                                    required
                                >
                                    Tipo de contenido
                                </FieldLabel>
                                <Select
                                    v-model="field.content_type"
                                    :disabled="form.processing"
                                >
                                    <SelectTrigger
                                        :id="`new-template-field-type-${index}`"
                                        class="w-full"
                                        :aria-invalid="
                                            Boolean(
                                                errorFor(
                                                    `fields.${index}.content_type`,
                                                ),
                                            )
                                        "
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent portal-disabled>
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
                                <FieldError
                                    v-if="
                                        errorFor(`fields.${index}.content_type`)
                                    "
                                    :errors="[
                                        errorFor(
                                            `fields.${index}.content_type`,
                                        ),
                                    ]"
                                />
                            </Field>
                        </FieldGroup>
                    </FieldGroup>

                    <Button
                        type="button"
                        variant="outline"
                        class="mt-4 w-full"
                        :disabled="form.processing || form.fields.length >= 20"
                        @click="addField"
                    >
                        Agregar otro campo
                    </Button>
                </div>

                <div
                    class="flex justify-end gap-2 border-t bg-muted/30 px-4 py-3"
                >
                    <Button
                        type="button"
                        variant="outline"
                        :disabled="form.processing"
                        @click="updateOpen(false)"
                    >
                        Cancelar
                    </Button>
                    <Button type="submit" :disabled="form.processing">
                        <Spinner
                            v-if="form.processing"
                            data-icon="inline-start"
                        />
                        <Blocks
                            v-else
                            data-icon="inline-start"
                            aria-hidden="true"
                        />
                        Crear bloque
                    </Button>
                </div>
            </form>
        </component>
    </component>
</template>
