<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Settings2 } from '@lucide/vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { CurriculumBuilderProps } from '@/types/academic';

/*
 * Solo código y cantidad de ciclos. Los campos de la tarjeta (ACD, APE, AA, CRED,
 * TOTAL) los fija el reglamento y nacen con la malla; no se agregan ni se retiran aquí
 * (decisión del responsable del producto, 2026-09-03).
 */
defineProps<Pick<CurriculumBuilderProps, 'curriculum'>>();

const open = defineModel<boolean>('open', { default: false });
</script>

<template>
    <FormSheet
        v-model:open="open"
        trigger-label="Configurar malla"
        title="Configurar la malla"
        description="El cambio de código queda en auditoría. Los ciclos pueden variar entre carreras."
        :show-trigger="false"
    >
        <template #default="{ close }">
            <Form
                v-bind="
                    CareerAcademicStructureController.updateCurriculumConfiguration.form(
                        curriculum.id,
                    )
                "
                v-slot="{ errors, processing }"
                @success="close"
            >
                <FieldGroup>
                    <Field v-if="errors.record" data-invalid>
                        <FieldError :errors="[errors.record]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.code)">
                        <FieldLabel for="curriculum-code" required>
                            Código
                        </FieldLabel>
                        <Input
                            id="curriculum-code"
                            name="code"
                            :default-value="curriculum.code"
                            placeholder="Ej. MALLA-SW-2026"
                            required
                            :aria-invalid="Boolean(errors.code)"
                        />
                        <FieldError :errors="[errors.code]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.cycle_count)">
                        <FieldLabel for="curriculum-cycle-count" required>
                            Cantidad de ciclos
                        </FieldLabel>
                        <Input
                            id="curriculum-cycle-count"
                            name="cycle_count"
                            type="number"
                            min="1"
                            max="30"
                            :default-value="curriculum.cycle_count"
                            required
                            :aria-invalid="Boolean(errors.cycle_count)"
                        />
                        <FieldError :errors="[errors.cycle_count]" />
                    </Field>
                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="Settings2"
                        label="Guardar configuración"
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
