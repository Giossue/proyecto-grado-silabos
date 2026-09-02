<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { UserPlus } from '@lucide/vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import DatePicker from '@/components/DatePicker.vue';
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
import type { AcademicStructureProps } from '@/types/academic';

defineProps<Pick<AcademicStructureProps, 'options'>>();
</script>

<template>
    <FormSheet
        trigger-label="Asignar docente"
        title="Asignar docente"
        description="Seleccione una cuenta con rol Docente vigente y un paralelo perteneciente a esta carrera."
    >
        <template #default="{ close }">
            <Form
                v-bind="
                    CareerAcademicStructureController.store.form(
                        'asignacion_docente',
                    )
                "
                v-slot="{ errors, processing }"
                reset-on-success
                @success="close"
            >
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.user_id)">
                        <FieldLabel for="teacher-user" required>
                            Docente
                        </FieldLabel>
                        <Select name="user_id" required>
                            <SelectTrigger
                                id="teacher-user"
                                :aria-invalid="Boolean(errors.user_id)"
                            >
                                <SelectValue
                                    placeholder="Seleccione un docente"
                                />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="item in options.teacherUsers"
                                        :key="item.id"
                                        :value="item.id"
                                    >
                                        {{ item.name }} · {{ item.email }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.user_id]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.parallel_id)">
                        <FieldLabel for="teacher-parallel" required>
                            Materia, periodo y paralelo
                        </FieldLabel>
                        <Select name="parallel_id" required>
                            <SelectTrigger
                                id="teacher-parallel"
                                :aria-invalid="Boolean(errors.parallel_id)"
                            >
                                <SelectValue
                                    placeholder="Seleccione un paralelo"
                                />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="item in options.parallels"
                                        :key="item.id"
                                        :value="item.id"
                                    >
                                        {{ item.label }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.parallel_id]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.valid_from)">
                        <FieldLabel for="teacher-valid-from" required>
                            Vigente desde
                        </FieldLabel>
                        <DatePicker
                            id="teacher-valid-from"
                            name="valid_from"
                            required
                            :aria-invalid="Boolean(errors.valid_from)"
                        />
                        <FieldError :errors="[errors.valid_from]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.valid_until)">
                        <FieldLabel for="teacher-valid-until">
                            Vigente hasta
                        </FieldLabel>
                        <DatePicker
                            id="teacher-valid-until"
                            name="valid_until"
                            :aria-invalid="Boolean(errors.valid_until)"
                        />
                        <FieldError :errors="[errors.valid_until]" />
                    </Field>
                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="UserPlus"
                        label="Asignar docencia"
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
