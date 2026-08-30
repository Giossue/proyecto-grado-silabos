<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Plus } from '@lucide/vue';
import AcademicSourceController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/AcademicSourceController';
import DatePicker from '@/components/DatePicker.vue';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import {
    Field,
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
import { Textarea } from '@/components/ui/textarea';

defineProps<{
    careers: { id: string; nombre: string }[];
    isAdministrator: boolean;
}>();
</script>

<template>
    <FormSheet
        trigger-label="Nueva fuente"
        title="Nueva fuente académica"
        description="Registre su autoridad, responsable y vigencia. Una contradicción exige resolución humana; el sistema no decide precedencias automáticamente."
    >
        <template #default="{ close }">
            <Form
                v-bind="AcademicSourceController.store.form()"
                v-slot="{ errors, processing }"
                reset-on-success
                @success="close"
            >
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.name)">
                        <FieldLabel for="source-name" required>
                            Nombre
                        </FieldLabel>
                        <Input
                            id="source-name"
                            name="name"
                            required
                            :aria-invalid="Boolean(errors.name)"
                        />
                        <FieldError :errors="[errors.name]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.type)">
                        <FieldLabel for="source-type" required>
                            Tipo
                        </FieldLabel>
                        <Input
                            id="source-type"
                            name="type"
                            placeholder="Malla, guía, normativa…"
                            required
                            :aria-invalid="Boolean(errors.type)"
                        />
                        <FieldError :errors="[errors.type]" />
                    </Field>

                    <Field
                        v-if="isAdministrator"
                        :data-invalid="Boolean(errors.career_id)"
                    >
                        <FieldLabel for="source-career">Carrera</FieldLabel>
                        <Select name="career_id">
                            <SelectTrigger
                                id="source-career"
                                :aria-invalid="Boolean(errors.career_id)"
                            >
                                <SelectValue
                                    placeholder="Seleccione una carrera"
                                />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="career in careers"
                                        :key="career.id"
                                        :value="career.id"
                                    >
                                        {{ career.nombre }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.career_id]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.authority)">
                        <FieldLabel for="source-authority" required>
                            Autoridad emisora
                        </FieldLabel>
                        <Input
                            id="source-authority"
                            name="authority"
                            required
                            :aria-invalid="Boolean(errors.authority)"
                        />
                        <FieldError :errors="[errors.authority]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.responsible)">
                        <FieldLabel for="source-responsible" required>
                            Responsable de custodia
                        </FieldLabel>
                        <Input
                            id="source-responsible"
                            name="responsible"
                            required
                            :aria-invalid="Boolean(errors.responsible)"
                        />
                        <FieldError :errors="[errors.responsible]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.description)">
                        <FieldLabel for="source-description">
                            Descripción
                        </FieldLabel>
                        <Textarea
                            id="source-description"
                            name="description"
                            :aria-invalid="Boolean(errors.description)"
                        />
                        <FieldError :errors="[errors.description]" />
                    </Field>

                    <div class="grid gap-4 sm:grid-cols-2">
                        <Field :data-invalid="Boolean(errors.valid_from)">
                            <FieldLabel for="source-valid-from">
                                Vigente desde
                            </FieldLabel>
                            <DatePicker
                                id="source-valid-from"
                                name="valid_from"
                                :aria-invalid="Boolean(errors.valid_from)"
                            />
                            <FieldError :errors="[errors.valid_from]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.valid_until)">
                            <FieldLabel for="source-valid-until">
                                Vigente hasta
                            </FieldLabel>
                            <DatePicker
                                id="source-valid-until"
                                name="valid_until"
                                :aria-invalid="Boolean(errors.valid_until)"
                            />
                            <FieldError :errors="[errors.valid_until]" />
                        </Field>
                    </div>

                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="Plus"
                        label="Crear fuente"
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
