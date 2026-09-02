<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Link2 } from '@lucide/vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { CurriculumBuilderProps } from '@/types/academic';

defineProps<{
    curriculum: CurriculumBuilderProps['curriculum'];
    subjects: CurriculumBuilderProps['subjects'];
}>();

const open = defineModel<boolean>('open', { default: false });
</script>

<template>
    <FormSheet
        v-model:open="open"
        trigger-label="Agregar relación"
        title="Agregar relación académica"
        description="Prerrequisitos y correquisitos se registran aquí o dibujando la conexión en el modo interactivo."
        :show-trigger="false"
    >
        <template #default="{ close }">
            <Form
                v-bind="
                    CareerAcademicStructureController.storeSubjectRequirement.form(
                        curriculum.id,
                    )
                "
                v-slot="{ errors, processing }"
                reset-on-success
                @success="close"
            >
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.requirement_id)">
                        <FieldLabel for="requirement-source" required>
                            Materia requerida
                        </FieldLabel>
                        <Select name="requirement_id" required>
                            <SelectTrigger
                                id="requirement-source"
                                :aria-invalid="Boolean(errors.requirement_id)"
                            >
                                <SelectValue
                                    placeholder="Seleccione una materia"
                                />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="subject in subjects"
                                        :key="subject.id"
                                        :value="subject.id"
                                    >
                                        {{ subject.code }} · {{ subject.name }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.requirement_id]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.subject_id)">
                        <FieldLabel for="requirement-target" required>
                            Materia que la necesita
                        </FieldLabel>
                        <Select name="subject_id" required>
                            <SelectTrigger
                                id="requirement-target"
                                :aria-invalid="Boolean(errors.subject_id)"
                            >
                                <SelectValue
                                    placeholder="Seleccione una materia"
                                />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="subject in subjects"
                                        :key="subject.id"
                                        :value="subject.id"
                                    >
                                        {{ subject.code }} · {{ subject.name }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.subject_id]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.type)">
                        <FieldLabel for="requirement-type" required>
                            Tipo
                        </FieldLabel>
                        <Select
                            name="type"
                            default-value="prerrequisito"
                            required
                        >
                            <SelectTrigger id="requirement-type">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="prerrequisito">
                                        Prerrequisito
                                    </SelectItem>
                                    <SelectItem value="correquisito">
                                        Correquisito
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.type]" />
                    </Field>

                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="Link2"
                        label="Agregar relación"
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
