<script setup lang="ts">
import { Form, useForm } from '@inertiajs/vue3';
import { Upload } from '@lucide/vue';
import { computed, watch } from 'vue';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import { Button } from '@/components/ui/button';
import {
    Field,
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
import { toast } from '@/lib/toast';
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

const copy = (value: TemplateAppearance): TemplateAppearance => ({
    ...value,
    field_font_size: value.body_font_size,
});
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
    () => form.body_font_size,
    (value) => {
        form.field_font_size = value;
    },
);

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
    toast.success('Logo de la universidad actualizado');
};

const submit = (): void => {
    form.patch(TemplateController.updateAppearance.url(props.templateId), {
        preserveScroll: true,
        onSuccess: () => {
            toast.success('Apariencia guardada');
            emit('update:open', false);
        },
        onError: (errors) => {
            if (!('purge_required' in errors)) {
                toast.error(
                    Object.values(errors)[0] ??
                        'No se pudo guardar la apariencia',
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
                <FieldGroup class="grid gap-6">
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
                        <FieldGroup class="grid gap-3 sm:grid-cols-3">
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
                        </FieldGroup>
                    </FieldSet>

                    <FieldError v-if="error" :errors="[error]" />
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
