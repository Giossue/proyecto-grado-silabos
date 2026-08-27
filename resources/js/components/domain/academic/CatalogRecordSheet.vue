<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Plus } from '@lucide/vue';
import { computed } from 'vue';
import AcademicGovernanceController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/AcademicGovernanceController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import {
    Field,
    FieldDescription,
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
import type {
    AcademicStructureProps,
    GovernanceCatalogEntity,
} from '@/types/academic';

const props = defineProps<
    Pick<AcademicStructureProps, 'options'> & {
        entity: GovernanceCatalogEntity;
    }
>();

const labels = computed(
    () =>
        ({
            faculty: {
                trigger: 'Nueva facultad',
                title: 'Nueva facultad',
                description:
                    'Registre una unidad académica que agrupará sus carreras.',
            },
            career: {
                trigger: 'Nueva carrera',
                title: 'Nueva carrera',
                description:
                    'Registre una carrera dentro de una facultad activa.',
            },
            campus: {
                trigger: 'Nuevo campus',
                title: 'Nuevo campus',
                description:
                    'Registre una sede institucional disponible para la oferta académica.',
            },
            modality: {
                trigger: 'Nueva modalidad',
                title: 'Nueva modalidad',
                description: 'Registre una forma institucional de impartición.',
            },
            period: {
                trigger: 'Nuevo periodo académico',
                title: 'Nuevo periodo académico',
                description:
                    'Registre una ventana temporal institucional con fechas válidas.',
            },
        })[props.entity],
);

const submitLabel = computed(
    () =>
        ({
            faculty: 'Crear facultad',
            career: 'Crear carrera',
            campus: 'Crear campus',
            modality: 'Crear modalidad',
            period: 'Crear periodo',
        })[props.entity],
);

const codeLabel = computed(() =>
    ['modality', 'period'].includes(props.entity)
        ? 'Código estable'
        : 'Código institucional',
);
</script>

<template>
    <FormSheet
        :trigger-label="labels.trigger"
        :title="labels.title"
        :description="labels.description"
    >
        <template #default="{ close }">
            <div class="flex flex-col gap-6">
                <Form
                    :key="entity"
                    v-bind="AcademicGovernanceController.store.form(entity)"
                    v-slot="{ errors, processing }"
                    reset-on-success
                    @success="close"
                >
                    <FieldGroup>
                        <Field
                            v-if="entity === 'career'"
                            :data-invalid="Boolean(errors.faculty_id)"
                        >
                            <FieldLabel for="catalog-faculty">
                                Facultad
                            </FieldLabel>
                            <Select name="faculty_id">
                                <SelectTrigger
                                    id="catalog-faculty"
                                    :aria-invalid="Boolean(errors.faculty_id)"
                                >
                                    <SelectValue
                                        placeholder="Seleccione una facultad"
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem
                                            v-for="item in options.faculties"
                                            :key="item.id"
                                            :value="item.id"
                                        >
                                            {{ item.nombre }}
                                        </SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                            <FieldDescription>
                                Toda carrera debe pertenecer a una facultad
                                activa.
                            </FieldDescription>
                            <FieldError :errors="[errors.faculty_id]" />
                        </Field>

                        <Field :data-invalid="Boolean(errors.name)">
                            <FieldLabel for="catalog-name">Nombre</FieldLabel>
                            <Input
                                id="catalog-name"
                                name="name"
                                required
                                :aria-invalid="Boolean(errors.name)"
                            />
                            <FieldError :errors="[errors.name]" />
                        </Field>

                        <Field :data-invalid="Boolean(errors.code)">
                            <FieldLabel for="catalog-code">
                                {{ codeLabel }}
                            </FieldLabel>
                            <Input
                                id="catalog-code"
                                name="code"
                                :required="
                                    entity === 'modality' || entity === 'period'
                                "
                                :aria-invalid="Boolean(errors.code)"
                            />
                            <FieldError :errors="[errors.code]" />
                        </Field>

                        <Field
                            v-if="entity === 'period'"
                            :data-invalid="Boolean(errors.starts_on)"
                        >
                            <FieldLabel for="catalog-starts-on">
                                Fecha de inicio
                            </FieldLabel>
                            <Input
                                id="catalog-starts-on"
                                name="starts_on"
                                type="date"
                                required
                                :aria-invalid="Boolean(errors.starts_on)"
                            />
                            <FieldError :errors="[errors.starts_on]" />
                        </Field>

                        <Field
                            v-if="entity === 'period'"
                            :data-invalid="Boolean(errors.ends_on)"
                        >
                            <FieldLabel for="catalog-ends-on">
                                Fecha de fin
                            </FieldLabel>
                            <Input
                                id="catalog-ends-on"
                                name="ends_on"
                                type="date"
                                required
                                :aria-invalid="Boolean(errors.ends_on)"
                            />
                            <FieldError :errors="[errors.ends_on]" />
                        </Field>

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
