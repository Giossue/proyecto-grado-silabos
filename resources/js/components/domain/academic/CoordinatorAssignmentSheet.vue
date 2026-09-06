<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { UserPlus } from '@lucide/vue';
import AcademicGovernanceController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/AcademicGovernanceController';
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
        trigger-label="Asignar coordinación"
        title="Asignar coordinación de carrera"
        description="Seleccione la persona y la carrera que coordinará. La asignación anterior se conserva como inactiva."
    >
        <template #default="{ close }">
            <Form
                v-bind="
                    AcademicGovernanceController.store.form(
                        'asignacion_coordinador',
                    )
                "
                v-slot="{ errors, processing }"
                reset-on-success
                @success="close"
            >
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.user_id)">
                        <FieldLabel for="coordinator-user" required>
                            Coordinador
                        </FieldLabel>
                        <Select name="user_id" required>
                            <SelectTrigger
                                id="coordinator-user"
                                :aria-invalid="Boolean(errors.user_id)"
                            >
                                <SelectValue
                                    placeholder="Seleccione una cuenta"
                                />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="item in options.coordinatorUsers"
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
                    <Field :data-invalid="Boolean(errors.career_id)">
                        <FieldLabel for="coordinator-career" required>
                            Carrera
                        </FieldLabel>
                        <Select name="career_id" required>
                            <SelectTrigger
                                id="coordinator-career"
                                :aria-invalid="Boolean(errors.career_id)"
                            >
                                <SelectValue
                                    placeholder="Seleccione una carrera"
                                />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="item in options.careers"
                                        :key="item.id"
                                        :value="item.id"
                                    >
                                        {{ item.nombre }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.career_id]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.quality)">
                        <FieldLabel for="coordinator-quality" required>
                            Calidad de la coordinación
                        </FieldLabel>
                        <Select name="quality" default-value="titular" required>
                            <SelectTrigger
                                id="coordinator-quality"
                                :aria-invalid="Boolean(errors.quality)"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="titular">
                                        Titular
                                    </SelectItem>
                                    <SelectItem value="encargado">
                                        Encargado
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.quality]" />
                    </Field>
                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="UserPlus"
                        label="Asignar coordinación"
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
