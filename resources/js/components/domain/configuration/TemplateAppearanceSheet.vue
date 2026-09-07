<script setup lang="ts">
import { useForm } from '@inertiajs/vue3';
import { computed, watch } from 'vue';
import { toast } from 'vue-sonner';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldContent,
    FieldError,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from '@/components/ui/field';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import type {
    TemplateAppearance,
    TemplateAppearanceOptions,
} from '@/types/configuration';

const props = defineProps<{
    open: boolean;
    templateId: string;
    appearance: TemplateAppearance;
    options: TemplateAppearanceOptions;
}>();

const emit = defineEmits<{
    'update:open': [value: boolean];
    preview: [value: TemplateAppearance];
}>();

const copy = (value: TemplateAppearance): TemplateAppearance => ({ ...value });
const form = useForm<TemplateAppearance>(copy(props.appearance));

const error = computed(() =>
    Object.entries(form.errors)
        .filter(
            ([key, value]) =>
                Boolean(value) &&
                !['purge_count', 'purge_required'].includes(key),
        )
        .map(([, value]) => value)
        .join(' '),
);

const reset = (): void => {
    form.clearErrors();
    Object.assign(form, copy(props.appearance));
    emit('preview', copy(props.appearance));
};

watch(
    () => props.open,
    (open) => {
        if (open) {
            reset();
        }
    },
);

watch(
    () => form.data(),
    (value) => {
        if (props.open) {
            emit('preview', copy(value));
        }
    },
    { deep: true },
);

const close = (): void => {
    if (form.processing) {
        return;
    }

    reset();
    emit('update:open', false);
};

const updateOpen = (value: boolean): void => {
    if (value) {
        emit('update:open', true);

        return;
    }

    close();
};

const submit = (): void => {
    form.patch(TemplateController.updateAppearance.url(props.templateId), {
        preserveScroll: true,
        onSuccess: () => {
            toast.success('Apariencia guardada.');
            emit('update:open', false);
        },
        onError: (errors) => {
            if (!('purge_required' in errors)) {
                toast.error(
                    Object.values(errors)[0] ??
                        'No se pudo guardar la apariencia.',
                );
            }
        },
    });
};
</script>

<template>
    <Sheet :open="open" @update:open="updateOpen">
        <SheetContent class="w-full overflow-hidden sm:max-w-lg">
            <SheetHeader>
                <SheetTitle>Personalizar plantilla</SheetTitle>
                <SheetDescription>
                    Ajustes institucionales aplicados a toda la hoja y a la
                    exportación.
                </SheetDescription>
            </SheetHeader>

            <form class="flex min-h-0 flex-1 flex-col" @submit.prevent="submit">
                <FieldGroup class="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
                    <FieldSet>
                        <FieldLegend>Documento</FieldLegend>
                        <FieldGroup>
                            <Field>
                                <FieldLabel for="template-orientation">
                                    Orientación
                                </FieldLabel>
                                <Select
                                    v-model="form.orientation"
                                    :disabled="form.processing"
                                >
                                    <SelectTrigger id="template-orientation">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem
                                                v-for="option in options.orientations"
                                                :key="option.value"
                                                :value="option.value"
                                            >
                                                {{ option.label }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field>
                                <FieldLabel for="template-margin">
                                    Márgenes
                                </FieldLabel>
                                <Select
                                    v-model="form.margin_cm"
                                    :disabled="form.processing"
                                >
                                    <SelectTrigger id="template-margin">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem
                                                v-for="option in options.margins"
                                                :key="option.value"
                                                :value="option.value"
                                            >
                                                {{ option.label }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>
                        </FieldGroup>
                    </FieldSet>

                    <FieldSet>
                        <FieldLegend>Tipografía</FieldLegend>
                        <FieldGroup>
                            <Field>
                                <FieldLabel for="template-font">
                                    Fuente general
                                </FieldLabel>
                                <Select
                                    v-model="form.font_family"
                                    :disabled="form.processing"
                                >
                                    <SelectTrigger id="template-font">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem
                                                v-for="option in options.fonts"
                                                :key="option.value"
                                                :value="option.value"
                                            >
                                                {{ option.label }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>

                            <div class="grid grid-cols-2 gap-3">
                                <Field>
                                    <FieldLabel for="template-title-size">
                                        Título
                                    </FieldLabel>
                                    <Select
                                        v-model="form.title_font_size"
                                        :disabled="form.processing"
                                    >
                                        <SelectTrigger id="template-title-size">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectGroup>
                                                <SelectItem
                                                    v-for="option in options.title_sizes"
                                                    :key="option.value"
                                                    :value="option.value"
                                                >
                                                    {{ option.label }}
                                                </SelectItem>
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                </Field>
                                <Field>
                                    <FieldLabel for="template-block-size">
                                        Bloques
                                    </FieldLabel>
                                    <Select
                                        v-model="form.section_font_size"
                                        :disabled="form.processing"
                                    >
                                        <SelectTrigger id="template-block-size">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectGroup>
                                                <SelectItem
                                                    v-for="option in options.section_sizes"
                                                    :key="option.value"
                                                    :value="option.value"
                                                >
                                                    {{ option.label }}
                                                </SelectItem>
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                </Field>
                                <Field>
                                    <FieldLabel for="template-field-size">
                                        Campos
                                    </FieldLabel>
                                    <Select
                                        v-model="form.field_font_size"
                                        :disabled="form.processing"
                                    >
                                        <SelectTrigger id="template-field-size">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectGroup>
                                                <SelectItem
                                                    v-for="option in options.field_sizes"
                                                    :key="option.value"
                                                    :value="option.value"
                                                >
                                                    {{ option.label }}
                                                </SelectItem>
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                </Field>
                                <Field>
                                    <FieldLabel for="template-body-size">
                                        Contenido
                                    </FieldLabel>
                                    <Select
                                        v-model="form.body_font_size"
                                        :disabled="form.processing"
                                    >
                                        <SelectTrigger id="template-body-size">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectGroup>
                                                <SelectItem
                                                    v-for="option in options.body_sizes"
                                                    :key="option.value"
                                                    :value="option.value"
                                                >
                                                    {{ option.label }}
                                                </SelectItem>
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                </Field>
                            </div>
                        </FieldGroup>
                    </FieldSet>

                    <FieldSet>
                        <FieldLegend>Colores</FieldLegend>
                        <FieldGroup>
                            <Field
                                v-for="setting in [
                                    {
                                        key: 'text_color',
                                        label: 'Texto',
                                    },
                                    {
                                        key: 'accent_color',
                                        label: 'Título principal',
                                    },
                                    {
                                        key: 'table_header_background',
                                        label: 'Fondo de cabecera de tabla',
                                    },
                                    {
                                        key: 'table_header_color',
                                        label: 'Texto de cabecera de tabla',
                                    },
                                ] as const"
                                :key="setting.key"
                            >
                                <FieldLabel :for="`template-${setting.key}`">
                                    {{ setting.label }}
                                </FieldLabel>
                                <Select
                                    v-model="form[setting.key]"
                                    :disabled="form.processing"
                                >
                                    <SelectTrigger
                                        :id="`template-${setting.key}`"
                                    >
                                        <span
                                            class="size-3 rounded-sm border"
                                            :style="{
                                                backgroundColor:
                                                    form[setting.key],
                                            }"
                                            aria-hidden="true"
                                        />
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem
                                                v-for="option in options.colors"
                                                :key="option.value"
                                                :value="option.value"
                                            >
                                                <span
                                                    class="flex items-center gap-2"
                                                >
                                                    <span
                                                        class="size-3 rounded-sm border"
                                                        :style="{
                                                            backgroundColor:
                                                                option.value,
                                                        }"
                                                        aria-hidden="true"
                                                    />
                                                    {{ option.label }}
                                                </span>
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>
                        </FieldGroup>
                    </FieldSet>

                    <FieldSet>
                        <FieldLegend>Texto y alineación</FieldLegend>
                        <FieldGroup>
                            <Field>
                                <FieldLabel for="template-title-alignment">
                                    Título principal
                                </FieldLabel>
                                <Select
                                    v-model="form.title_alignment"
                                    :disabled="form.processing"
                                >
                                    <SelectTrigger
                                        id="template-title-alignment"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem
                                                v-for="option in options.alignments"
                                                :key="option.value"
                                                :value="option.value"
                                            >
                                                {{ option.label }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>
                            <div class="grid grid-cols-2 gap-3">
                                <Field orientation="horizontal">
                                    <Checkbox
                                        id="template-title-bold"
                                        v-model="form.title_bold"
                                        :disabled="form.processing"
                                    />
                                    <FieldContent>
                                        <FieldLabel for="template-title-bold">
                                            Título en negrita
                                        </FieldLabel>
                                    </FieldContent>
                                </Field>
                                <Field orientation="horizontal">
                                    <Checkbox
                                        id="template-title-italic"
                                        v-model="form.title_italic"
                                        :disabled="form.processing"
                                    />
                                    <FieldContent>
                                        <FieldLabel for="template-title-italic">
                                            Título en cursiva
                                        </FieldLabel>
                                    </FieldContent>
                                </Field>
                            </div>
                            <Field>
                                <FieldLabel for="template-section-alignment">
                                    Títulos de bloque
                                </FieldLabel>
                                <Select
                                    v-model="form.section_alignment"
                                    :disabled="form.processing"
                                >
                                    <SelectTrigger
                                        id="template-section-alignment"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem
                                                v-for="option in options.alignments"
                                                :key="option.value"
                                                :value="option.value"
                                            >
                                                {{ option.label }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>
                            <div class="grid grid-cols-2 gap-3">
                                <Field orientation="horizontal">
                                    <Checkbox
                                        id="template-section-bold"
                                        v-model="form.section_bold"
                                        :disabled="form.processing"
                                    />
                                    <FieldContent>
                                        <FieldLabel for="template-section-bold">
                                            Bloques en negrita
                                        </FieldLabel>
                                    </FieldContent>
                                </Field>
                                <Field orientation="horizontal">
                                    <Checkbox
                                        id="template-section-italic"
                                        v-model="form.section_italic"
                                        :disabled="form.processing"
                                    />
                                    <FieldContent>
                                        <FieldLabel
                                            for="template-section-italic"
                                        >
                                            Bloques en cursiva
                                        </FieldLabel>
                                    </FieldContent>
                                </Field>
                            </div>
                            <Field>
                                <FieldLabel for="template-body-alignment">
                                    Contenido
                                </FieldLabel>
                                <Select
                                    v-model="form.body_alignment"
                                    :disabled="form.processing"
                                >
                                    <SelectTrigger id="template-body-alignment">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem
                                                v-for="option in options.alignments"
                                                :key="option.value"
                                                :value="option.value"
                                            >
                                                {{ option.label }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </Field>
                        </FieldGroup>
                    </FieldSet>

                    <FieldError v-if="error" :errors="[error]" />
                </FieldGroup>

                <SheetFooter class="shrink-0 border-t bg-card">
                    <Button
                        type="button"
                        variant="outline"
                        :disabled="form.processing"
                        @click="close"
                    >
                        Cancelar
                    </Button>
                    <Button type="submit" :disabled="form.processing">
                        Guardar apariencia
                    </Button>
                </SheetFooter>
            </form>
        </SheetContent>
    </Sheet>
</template>
