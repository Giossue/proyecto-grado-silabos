<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { ShieldCheck } from '@lucide/vue';
import { ref } from 'vue';
import ManagedUserController from '@/actions/App/Modules/Identity/Presentation/Http/Controllers/ManagedUserController';
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

defineProps<{
    managedUserId: string;
    roles: { codigo: string; nombre: string }[];
    careers: { id: string; nombre: string }[];
    today: string;
}>();

const selectedRole = ref('teacher');
</script>

<template>
    <FormSheet
        trigger-label="Asignar rol"
        title="Asignar otro rol"
        description="Defina el rol, su alcance y vigencia. Los privilegios no se combinan hasta seleccionar ese rol."
    >
        <template #default="{ close }">
            <Form
                v-bind="ManagedUserController.assignRole.form(managedUserId)"
                v-slot="{ errors, processing }"
                reset-on-success
                @success="close"
            >
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.role_code)">
                        <FieldLabel for="role-assignment-role">
                            Rol
                        </FieldLabel>
                        <Select v-model="selectedRole" name="role_code">
                            <SelectTrigger
                                id="role-assignment-role"
                                :aria-invalid="Boolean(errors.role_code)"
                            >
                                <SelectValue placeholder="Seleccione un rol" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="role in roles"
                                        :key="role.codigo"
                                        :value="role.codigo"
                                    >
                                        {{ role.nombre }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.role_code]" />
                    </Field>
                    <Field
                        v-if="selectedRole !== 'administrator'"
                        :data-invalid="Boolean(errors.career_id)"
                    >
                        <FieldLabel for="role-assignment-career">
                            Carrera
                        </FieldLabel>
                        <Select name="career_id">
                            <SelectTrigger
                                id="role-assignment-career"
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
                    <Field :data-invalid="Boolean(errors.valid_from)">
                        <FieldLabel for="role-assignment-valid-from">
                            Vigente desde
                        </FieldLabel>
                        <DatePicker
                            id="role-assignment-valid-from"
                            name="valid_from"
                            :default-value="today"
                            required
                            :aria-invalid="Boolean(errors.valid_from)"
                        />
                        <FieldError :errors="[errors.valid_from]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.valid_until)">
                        <FieldLabel for="role-assignment-valid-until">
                            Vigente hasta (opcional)
                        </FieldLabel>
                        <DatePicker
                            id="role-assignment-valid-until"
                            name="valid_until"
                            :aria-invalid="Boolean(errors.valid_until)"
                        />
                        <FieldError :errors="[errors.valid_until]" />
                    </Field>
                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="ShieldCheck"
                        label="Asignar rol"
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
