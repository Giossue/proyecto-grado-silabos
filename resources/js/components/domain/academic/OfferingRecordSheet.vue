<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Plus } from '@lucide/vue';
import { computed, ref } from 'vue';
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
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { AcademicStructureProps } from '@/types/academic';

type OfferingEntity = 'offering' | 'parallel';

defineProps<Pick<AcademicStructureProps, 'options'>>();

const entity = ref<OfferingEntity>('offering');
const submitLabel = computed(() =>
    entity.value === 'offering' ? 'Crear oferta' : 'Crear paralelo',
);
</script>

<template>
    <FormSheet
        trigger-label="Agregar"
        title="Agregar oferta o paralelo"
        description="Abra una materia publicada para un periodo académico o agregue un paralelo a una oferta existente."
    >
        <template #default="{ close }">
            <div class="flex flex-col gap-6">
                <FieldGroup>
                    <Field>
                        <FieldLabel for="offering-entity">
                            Tipo de registro
                        </FieldLabel>
                        <Select v-model="entity">
                            <SelectTrigger id="offering-entity">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="offering">
                                        Oferta académica
                                    </SelectItem>
                                    <SelectItem value="parallel">
                                        Paralelo
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </Field>
                </FieldGroup>

                <Form
                    :key="entity"
                    v-bind="
                        CareerAcademicStructureController.store.form(entity)
                    "
                    v-slot="{ errors, processing }"
                    reset-on-success
                    @success="close"
                >
                    <FieldGroup>
                        <template v-if="entity === 'offering'">
                            <Field :data-invalid="Boolean(errors.subject_id)">
                                <FieldLabel for="offering-subject">
                                    Materia publicada
                                </FieldLabel>
                                <Select name="subject_id">
                                    <SelectTrigger
                                        id="offering-subject"
                                        :aria-invalid="
                                            Boolean(errors.subject_id)
                                        "
                                    >
                                        <SelectValue
                                            placeholder="Seleccione una materia"
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem
                                                v-for="item in options.publishedSubjects"
                                                :key="item.id"
                                                :value="item.id"
                                            >
                                                {{ item.codigo_institucional }}
                                                ·
                                                {{ item.nombre }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                                <FieldError :errors="[errors.subject_id]" />
                            </Field>
                            <Field :data-invalid="Boolean(errors.period_id)">
                                <FieldLabel for="offering-period">
                                    Periodo académico
                                </FieldLabel>
                                <Select name="period_id">
                                    <SelectTrigger
                                        id="offering-period"
                                        :aria-invalid="
                                            Boolean(errors.period_id)
                                        "
                                    >
                                        <SelectValue
                                            placeholder="Seleccione un periodo"
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem
                                                v-for="item in options.periods"
                                                :key="item.id"
                                                :value="item.id"
                                            >
                                                {{ item.nombre }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                                <FieldError :errors="[errors.period_id]" />
                            </Field>
                            <Field :data-invalid="Boolean(errors.campus_id)">
                                <FieldLabel for="offering-campus">
                                    Campus
                                </FieldLabel>
                                <Select name="campus_id">
                                    <SelectTrigger
                                        id="offering-campus"
                                        :aria-invalid="
                                            Boolean(errors.campus_id)
                                        "
                                    >
                                        <SelectValue
                                            placeholder="Seleccione un campus"
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem
                                                v-for="item in options.campuses"
                                                :key="item.id"
                                                :value="item.id"
                                            >
                                                {{ item.nombre }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                                <FieldError :errors="[errors.campus_id]" />
                            </Field>
                            <Field :data-invalid="Boolean(errors.modality_id)">
                                <FieldLabel for="offering-modality">
                                    Modalidad
                                </FieldLabel>
                                <Select name="modality_id">
                                    <SelectTrigger
                                        id="offering-modality"
                                        :aria-invalid="
                                            Boolean(errors.modality_id)
                                        "
                                    >
                                        <SelectValue
                                            placeholder="Seleccione una modalidad"
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem
                                                v-for="item in options.modalities"
                                                :key="item.id"
                                                :value="item.id"
                                            >
                                                {{ item.nombre }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                                <FieldError :errors="[errors.modality_id]" />
                            </Field>
                        </template>

                        <template v-else>
                            <Field :data-invalid="Boolean(errors.offering_id)">
                                <FieldLabel for="parallel-offering">
                                    Oferta académica
                                </FieldLabel>
                                <Select name="offering_id">
                                    <SelectTrigger
                                        id="parallel-offering"
                                        :aria-invalid="
                                            Boolean(errors.offering_id)
                                        "
                                    >
                                        <SelectValue
                                            placeholder="Seleccione una oferta"
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem
                                                v-for="item in options.offerings"
                                                :key="item.id"
                                                :value="item.id"
                                            >
                                                {{ item.label }}
                                            </SelectItem>
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                                <FieldError :errors="[errors.offering_id]" />
                            </Field>
                            <Field :data-invalid="Boolean(errors.code)">
                                <FieldLabel for="parallel-code">
                                    Código de paralelo
                                </FieldLabel>
                                <Input
                                    id="parallel-code"
                                    name="code"
                                    required
                                    :aria-invalid="Boolean(errors.code)"
                                />
                                <FieldError :errors="[errors.code]" />
                            </Field>
                        </template>

                        <FormSheetActions
                            :close="close"
                            :processing="processing"
                            :icon="Plus"
                            :label="submitLabel"
                        />
                    </FieldGroup>
                </Form>
            </div>
        </template>
    </FormSheet>
</template>
