<script setup lang="ts">
import { Form, useForm } from '@inertiajs/vue3';
import { Upload } from '@lucide/vue';
import { computed, watch } from 'vue';
import { toast } from 'vue-sonner';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
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
import type {
    TemplateAppearance,
    TemplateAppearanceOptions,
} from '@/types/configuration';

const props = defineProps<{
    open: boolean;
    templateId: string;
    appearance: TemplateAppearance;
    options: TemplateAppearanceOptions;
    institutionLogoUrl: string;
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

const sheetOpen = computed({
    get: () => props.open,
    set: updateOpen,
});

const logoUpdated = (): void => {
    toast.success('Logo de la universidad actualizado.');
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
    <FormSheet
        v-model:open="sheetOpen"
        trigger-label="Personalizar plantilla"
        title="Personalizar plantilla"
        description="Ajustes institucionales aplicados a toda la hoja y a la exportación."
        :show-trigger="false"
        wide
    >
        <template #default="{ close: closeSheet }">
            <Form
                v-bind="TemplateController.storeLogo.form()"
                v-slot="{ errors, processing }"
                class="mb-6"
                reset-on-success
                @success="logoUpdated"
            >
                <FieldSet class="gap-4 rounded-lg border p-4">
                    <FieldLegend>Logo de la universidad</FieldLegend>
                    <div
                        class="flex min-h-20 items-center justify-center rounded-md border bg-background p-4"
                    >
                        <img
                            :src="institutionLogoUrl"
                            alt="Logo actual de la Universidad Estatal de Bolívar"
                            class="h-auto max-h-10 max-w-full object-contain"
                        />
                    </div>
                    <Field :data-invalid="Boolean(errors.logo)">
                        <FieldLabel for="template-institution-logo" required>
                            Nuevo logo
                        </FieldLabel>
                        <Input
                            id="template-institution-logo"
                            name="logo"
                            type="file"
                            accept="image/png"
                            required
                            :disabled="processing"
                            :aria-invalid="Boolean(errors.logo)"
                        />
                        <FieldDescription>
                            PNG transparente. Recomendado: 1012 × 190 px.
                        </FieldDescription>
                        <FieldError :errors="[errors.logo]" />
                    </Field>
                    <div class="flex justify-end">
                        <Button
                            type="submit"
                            variant="outline"
                            :disabled="processing"
                        >
                            <Spinner
                                v-if="processing"
                                data-icon="inline-start"
                            />
                            <Upload
                                v-else
                                data-icon="inline-start"
                                aria-hidden="true"
                            />
                            Actualizar logo
                        </Button>
                    </div>
                </FieldSet>
            </Form>

            <form @submit.prevent="submit">
                <FieldGroup class="grid gap-6 lg:grid-cols-2">
                    <FieldSet class="gap-4 rounded-lg border p-4">
                        <FieldLegend>Documento</FieldLegend>
                        <FieldGroup class="gap-4">
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

                    <FieldSet class="gap-4 rounded-lg border p-4">
                        <FieldLegend>Tipografía</FieldLegend>
                        <FieldGroup class="gap-4">
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

                    <FieldSet class="gap-4 rounded-lg border p-4">
                        <FieldLegend>Colores</FieldLegend>
                        <FieldGroup class="grid gap-4 sm:grid-cols-2">
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

                    <FieldSet class="gap-4 rounded-lg border p-4">
                        <FieldLegend>Texto y alineación</FieldLegend>
                        <FieldGroup class="gap-4">
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

                    <FieldError
                        v-if="error"
                        class="lg:col-span-2"
                        :errors="[error]"
                    />
                </FieldGroup>

                <FormSheetActions
                    :close="closeSheet"
                    :processing="form.processing"
                    label="Guardar apariencia"
                />
            </form>
        </template>
    </FormSheet>
</template>
