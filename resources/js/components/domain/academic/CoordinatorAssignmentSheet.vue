<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import AcademicGovernanceController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/AcademicGovernanceController';
import FormSheet from '@/components/domain/FormSheet.vue';
import { Button } from '@/components/ui/button';
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
import { Spinner } from '@/components/ui/spinner';
import type { AcademicStructureProps } from '@/types/academic';

defineProps<Pick<AcademicStructureProps, 'options'>>();
</script>

<template>
    <FormSheet
        trigger-label="Asignar coordinación"
        title="Asignar coordinación de carrera"
        description="La cuenta debe tener un rol Coordinador vigente en la misma carrera. La nueva vigencia conservará el historial institucional."
    >
        <template #default="{ close }">
            <Form
                v-bind="
                    AcademicGovernanceController.store.form(
                        'coordinator_assignment',
                    )
                "
                v-slot="{ errors, processing }"
                reset-on-success
                @success="close"
            >
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.user_id)">
                        <FieldLabel for="coordinator-user">
                            Coordinador
                        </FieldLabel>
                        <Select name="user_id">
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
                        <FieldLabel for="coordinator-career">
                            Carrera
                        </FieldLabel>
                        <Select name="career_id">
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
                    <Field :data-invalid="Boolean(errors.valid_from)">
                        <FieldLabel for="coordinator-valid-from">
                            Vigente desde
                        </FieldLabel>
                        <Input
                            id="coordinator-valid-from"
                            name="valid_from"
                            type="date"
                            required
                            :aria-invalid="Boolean(errors.valid_from)"
                        />
                        <FieldError :errors="[errors.valid_from]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.valid_until)">
                        <FieldLabel for="coordinator-valid-until">
                            Vigente hasta
                        </FieldLabel>
                        <Input
                            id="coordinator-valid-until"
                            name="valid_until"
                            type="date"
                            :aria-invalid="Boolean(errors.valid_until)"
                        />
                        <FieldError :errors="[errors.valid_until]" />
                    </Field>
                    <Field orientation="horizontal">
                        <Button type="submit" :disabled="processing">
                            <Spinner v-if="processing" />
                            Asignar coordinación
                        </Button>
                    </Field>
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
