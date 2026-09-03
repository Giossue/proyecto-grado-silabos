<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Plus } from '@lucide/vue';
import { computed } from 'vue';
import AcademicGovernanceController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/AcademicGovernanceController';
import DatePicker from '@/components/DatePicker.vue';
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
            facultad: {
                trigger: 'Nueva facultad',
                title: 'Nueva facultad',
                description:
                    'Registre una unidad académica que agrupará sus carreras.',
            },
            carrera: {
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
            modalidad: {
                trigger: 'Nueva modalidad',
                title: 'Nueva modalidad',
                description: 'Registre una forma institucional de impartición.',
            },
            periodo: {
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
            facultad: 'Crear facultad',
            carrera: 'Crear carrera',
            campus: 'Crear campus',
            modalidad: 'Crear modalidad',
            periodo: 'Crear periodo',
        })[props.entity],
);

const codeLabel = computed(() =>
    ['modalidad', 'periodo'].includes(props.entity)
        ? 'Código estable'
        : 'Código institucional',
);

const examples = computed(
    () =>
        ({
            facultad: {
                name: 'Ej. Facultad de Ciencias Administrativas',
                code: 'Ej. FCA',
            },
            carrera: { name: 'Ej. Software', code: 'Ej. SW' },
            campus: { name: 'Ej. Campus Matriz', code: 'Ej. MATRIZ' },
            modalidad: { name: 'Ej. Presencial', code: 'Ej. PRES' },
            periodo: { name: 'Ej. 2026-2027', code: 'Ej. 2026-2027' },
        })[props.entity],
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
                            v-if="entity === 'facultad'"
                            :data-invalid="Boolean(errors.logo)"
                        >
                            <FieldLabel for="faculty-logo" required>
                                Logo de la facultad
                            </FieldLabel>
                            <Input
                                id="faculty-logo"
                                name="logo"
                                type="file"
                                accept="image/png"
                                required
                                :aria-invalid="Boolean(errors.logo)"
                            />
                            <FieldDescription>
                                PNG sin fondo, exactamente 600 × 180 píxeles.
                                Encabeza el sílabo de todas sus carreras.
                            </FieldDescription>
                            <FieldError :errors="[errors.logo]" />
                        </Field>
                        <Field
                            v-if="entity === 'carrera'"
                            :data-invalid="Boolean(errors.faculty_id)"
                        >
                            <FieldLabel for="catalog-faculty" required>
                                Facultad
                            </FieldLabel>
                            <Select name="faculty_id" required>
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

                        <Field :data-invalid="Boolean(errors.nombre)">
                            <FieldLabel for="catalog-name" required>
                                Nombre
                            </FieldLabel>
                            <Input
                                id="catalog-name"
                                name="nombre"
                                :placeholder="examples.name"
                                required
                                :aria-invalid="Boolean(errors.nombre)"
                            />
                            <FieldError :errors="[errors.nombre]" />
                        </Field>

                        <Field :data-invalid="Boolean(errors.code)">
                            <FieldLabel
                                for="catalog-code"
                                :required="
                                    entity === 'modalidad' ||
                                    entity === 'periodo'
                                "
                            >
                                {{ codeLabel }}
                            </FieldLabel>
                            <Input
                                id="catalog-code"
                                name="code"
                                :placeholder="examples.code"
                                :required="
                                    entity === 'modalidad' ||
                                    entity === 'periodo'
                                "
                                :aria-invalid="Boolean(errors.code)"
                            />
                            <FieldError :errors="[errors.code]" />
                        </Field>

                        <Field
                            v-if="entity === 'periodo'"
                            :data-invalid="Boolean(errors.starts_on)"
                        >
                            <FieldLabel for="catalog-starts-on" required>
                                Fecha de inicio
                            </FieldLabel>
                            <DatePicker
                                id="catalog-starts-on"
                                name="starts_on"
                                required
                                :aria-invalid="Boolean(errors.starts_on)"
                            />
                            <FieldError :errors="[errors.starts_on]" />
                        </Field>

                        <Field
                            v-if="entity === 'periodo'"
                            :data-invalid="Boolean(errors.ends_on)"
                        >
                            <FieldLabel for="catalog-ends-on" required>
                                Fecha de fin
                            </FieldLabel>
                            <DatePicker
                                id="catalog-ends-on"
                                name="ends_on"
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
