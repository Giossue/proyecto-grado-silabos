<script setup lang="ts">
import { useForm } from '@inertiajs/vue3';
import { Plus } from '@lucide/vue';
import { watch } from 'vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { PARALLEL_SHIFTS as SHIFTS } from '@/lib/parallelShifts';

const props = defineProps<{
    offeringId: string;
    offeringLabel: string;
}>();

const open = defineModel<boolean>('open', { default: false });
const form = useForm<{ codes: string; shift: string }>({
    codes: '',
    shift: '',
});

const reset = (): void => {
    form.reset();
    form.clearErrors();
};

const submit = (close: () => void): void => {
    form
        .transform((data) => ({
            offering_id: props.offeringId,
            codes: [data.codes.trim()],
            shift: data.shift || null,
        }))
        .post(CareerAcademicStructureController.storeParallels.url(), {
            preserveScroll: true,
            onSuccess: () => {
                reset();
                close();
            },
        });
};

watch(open, (isOpen) => {
    if (isOpen) {
        reset();
    }
});
</script>

<template>
    <FormSheet
        v-model:open="open"
        trigger-label="Agregar paralelo"
        title="Agregar paralelo"
        :description="`Añada un paralelo a ${offeringLabel} y defina su jornada.`"
        :show-trigger="false"
    >
        <template #default="{ close }">
            <form class="contents" @submit.prevent="submit(close)">
                <FieldGroup>
                    <Field :data-invalid="Boolean(form.errors.codes)">
                        <FieldLabel
                            :for="`parallel-creation-code-${offeringId}`"
                            required
                        >
                            Código de paralelo
                        </FieldLabel>
                        <Input
                            :id="`parallel-creation-code-${offeringId}`"
                            v-model="form.codes"
                            maxlength="30"
                            placeholder="Ej. B"
                            required
                            :aria-invalid="Boolean(form.errors.codes)"
                        />
                        <FieldError :errors="[form.errors.codes]" />
                    </Field>

                    <Field :data-invalid="Boolean(form.errors.shift)">
                        <FieldLabel
                            :for="`parallel-creation-shift-${offeringId}`"
                        >
                            Jornada
                        </FieldLabel>
                        <Select v-model="form.shift">
                            <SelectTrigger
                                :id="`parallel-creation-shift-${offeringId}`"
                                :aria-invalid="Boolean(form.errors.shift)"
                            >
                                <SelectValue placeholder="Sin jornada definida" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="shift in SHIFTS"
                                        :key="shift.value"
                                        :value="shift.value"
                                    >
                                        {{ shift.label }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[form.errors.shift]" />
                    </Field>

                    <FormSheetActions
                        :close="close"
                        :processing="form.processing"
                        :icon="Plus"
                        label="Crear paralelo"
                    />
                </FieldGroup>
            </form>
        </template>
    </FormSheet>
</template>
