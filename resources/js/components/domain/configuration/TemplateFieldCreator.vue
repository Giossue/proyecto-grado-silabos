<script setup lang="ts">
import { useForm } from '@inertiajs/vue3';
import { ListPlus } from '@lucide/vue';
import { ref } from 'vue';
import { toast } from 'vue-sonner';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import TemplateIconPopover from '@/components/domain/configuration/TemplateIconPopover.vue';
import { Button } from '@/components/ui/button';
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
import type { TemplateContentType } from '@/types/configuration';

type EditableContentType = Exclude<
    TemplateContentType,
    'institutional' | 'flow'
>;

const props = defineProps<{
    templateId: string;
    sectionId: string;
    position: number;
    blockTypes: { value: EditableContentType; label: string }[];
}>();

const open = ref(false);
const form = useForm({
    section_id: props.sectionId,
    position: props.position + 1,
    key: '',
    label: '',
    content_type: 'text' as EditableContentType,
});

const keyFor = (): string =>
    `campo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const reset = (): void => {
    form.clearErrors();
    form.section_id = props.sectionId;
    form.position = props.position + 1;
    form.key = keyFor();
    form.label = '';
    form.content_type = 'text';
};

reset();

const errorFor = (path: string): string | undefined =>
    (form.errors as Record<string, string>)[path];

const submit = (): void => {
    form.position = props.position + 1;
    form.post(TemplateController.storeField.url(props.templateId), {
        preserveScroll: true,
        onSuccess: () => {
            toast.success('Campo agregado.');
            open.value = false;
            reset();
        },
        onError: (errors) => {
            if (!('purge_required' in errors)) {
                toast.error(
                    Object.values(errors)[0] ?? 'No se pudo agregar el campo.',
                );
            }
        },
    });
};

const updateOpen = (value: boolean): void => {
    open.value = value;

    if (!value && !form.processing) {
        reset();
    }
};
</script>

<template>
    <TemplateIconPopover
        :open="open"
        label="Agregar campo"
        button-class="size-7"
        @update:open="updateOpen"
    >
        <template #icon>
            <ListPlus aria-hidden="true" />
        </template>
        <PopoverContent align="end" class="w-[min(24rem,calc(100vw-2rem))]">
            <form class="flex flex-col gap-4" @submit.prevent="submit">
                <div class="flex flex-col gap-1">
                    <p class="font-medium">Nuevo campo</p>
                    <p class="text-sm text-muted-foreground">
                        Se añadirá dentro de este bloque.
                    </p>
                </div>
                <FieldGroup>
                    <Field :data-invalid="Boolean(errorFor('label'))">
                        <FieldLabel for="new-field-label" required>
                            Nombre
                        </FieldLabel>
                        <Input
                            id="new-field-label"
                            v-model="form.label"
                            maxlength="180"
                            placeholder="Ej. Objetivos específicos"
                            :disabled="form.processing"
                            :aria-invalid="Boolean(errorFor('label'))"
                        />
                        <FieldError
                            v-if="errorFor('label')"
                            :errors="[errorFor('label')]"
                        />
                    </Field>
                    <Field :data-invalid="Boolean(errorFor('content_type'))">
                        <FieldLabel for="new-field-content-type" required>
                            Tipo de contenido
                        </FieldLabel>
                        <Select
                            v-model="form.content_type"
                            :disabled="form.processing"
                        >
                            <SelectTrigger
                                id="new-field-content-type"
                                class="w-full"
                                :aria-invalid="
                                    Boolean(errorFor('content_type'))
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
                            v-if="errorFor('content_type')"
                            :errors="[errorFor('content_type')]"
                        />
                    </Field>
                </FieldGroup>
                <div class="flex justify-end gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        :disabled="form.processing"
                        @click="updateOpen(false)"
                    >
                        Cancelar
                    </Button>
                    <Button type="submit" :disabled="form.processing">
                        Agregar campo
                    </Button>
                </div>
            </form>
        </PopoverContent>
    </TemplateIconPopover>
</template>
