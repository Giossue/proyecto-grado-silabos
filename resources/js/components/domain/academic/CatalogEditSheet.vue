<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Check } from '@lucide/vue';
import { computed } from 'vue';
import AcademicGovernanceController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/AcademicGovernanceController';
import DatePicker from '@/components/DatePicker.vue';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import { Button } from '@/components/ui/button';
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
import { STUDY_MODALITIES } from '@/lib/studyModalities';
import type { CatalogRecord, GovernanceCatalogEntity } from '@/types/academic';

const props = withDefaults(
    defineProps<{
        entity: GovernanceCatalogEntity;
        recordId: string;
        recordName: string;
        recordCode: string | null;
        facultyId?: string | null;
        modality?: string | null;
        hybrid?: boolean;
        campusId?: string | null;
        startsOn?: string | null;
        endsOn?: string | null;
        faculties: CatalogRecord[];
        campuses?: CatalogRecord[];
        logoUrl?: string | null;
        showTrigger?: boolean;
    }>(),
    {
        showTrigger: true,
        campuses: () => [],
        hybrid: false,
    },
);

const open = defineModel<boolean>('open', { default: false });

const entityLabel = computed(
    () =>
        ({
            facultad: 'facultad',
            carrera: 'carrera',
            campus: 'campus',
            periodo: 'periodo académico',
        })[props.entity],
);

const codeLabel = computed(() =>
    props.entity === 'periodo' ? 'Código estable' : 'Código institucional',
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
            periodo: { name: 'Ej. 2026-2027', code: 'Ej. 2026-2027' },
        })[props.entity],
);

const facultyOptions = computed(() =>
    props.faculties.filter(
        (faculty) => faculty.activo || faculty.id === props.facultyId,
    ),
);
</script>

<template>
    <FormSheet
        v-model:open="open"
        trigger-label="Editar"
        :title="`Editar ${entityLabel}`"
        description="Actualice los datos institucionales. Los cambios quedarán registrados en auditoría."
        :show-trigger="showTrigger"
    >
        <template #trigger>
            <Button type="button" size="sm" variant="outline">Editar</Button>
        </template>

        <template #default="{ close }">
            <Form
                :key="recordId"
                v-bind="
                    AcademicGovernanceController.update.form({
                        entity,
                        record: recordId,
                    })
                "
                v-slot="{ errors, processing }"
                @success="close"
            >
                <FieldGroup>
                    <Field
                        v-if="entity === 'facultad'"
                        :data-invalid="Boolean(errors.logo)"
                    >
                        <FieldLabel :for="`edit-faculty-logo-${recordId}`">
                            Logo de la facultad
                        </FieldLabel>
                        <img
                            v-if="logoUrl"
                            :src="logoUrl"
                            alt="Logo actual de la facultad"
                            class="h-12 w-auto rounded border bg-white p-1"
                        />
                        <Input
                            :id="`edit-faculty-logo-${recordId}`"
                            name="logo"
                            type="file"
                            accept="image/png"
                            :aria-invalid="Boolean(errors.logo)"
                        />
                        <FieldDescription>
                            Para reemplazarlo: PNG sin fondo; se ajusta solo a
                            600 × 180 píxeles.
                        </FieldDescription>
                        <FieldError :errors="[errors.logo]" />
                    </Field>
                    <Field
                        v-if="entity === 'carrera'"
                        :data-invalid="Boolean(errors.faculty_id)"
                    >
                        <FieldLabel :for="`edit-faculty-${recordId}`" required>
                            Facultad
                        </FieldLabel>
                        <Select
                            name="faculty_id"
                            :default-value="facultyId ?? undefined"
                            required
                        >
                            <SelectTrigger
                                :id="`edit-faculty-${recordId}`"
                                :aria-invalid="Boolean(errors.faculty_id)"
                            >
                                <SelectValue
                                    placeholder="Seleccione una facultad"
                                />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="faculty in facultyOptions"
                                        :key="faculty.id"
                                        :value="faculty.id"
                                    >
                                        {{ faculty.nombre }}
                                        {{
                                            faculty.activo ? '' : '(archivada)'
                                        }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldDescription>
                            Reasignar una carrera exige otra facultad activa.
                        </FieldDescription>
                        <FieldError :errors="[errors.faculty_id]" />
                    </Field>
                    <Field
                        v-if="entity === 'carrera'"
                        :data-invalid="Boolean(errors.modality)"
                    >
                        <FieldLabel :for="`edit-modality-${recordId}`" required>
                            Modalidad
                        </FieldLabel>
                        <Select
                            name="modality"
                            :default-value="modality ?? undefined"
                            required
                        >
                            <SelectTrigger
                                :id="`edit-modality-${recordId}`"
                                :aria-invalid="Boolean(errors.modality)"
                            >
                                <SelectValue
                                    placeholder="Seleccione la modalidad aprobada"
                                />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="item in STUDY_MODALITIES"
                                        :key="item.value"
                                        :value="item.value"
                                    >
                                        {{ item.label }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldDescription>
                            {{
                                hybrid
                                    ? 'Hoy la carrera es híbrida: Coordinación apartó materias de esta base. La base no se puede cambiar hasta alinearlas en la malla.'
                                    : 'Las ofertas nuevas la heredan; las ya abiertas no cambian.'
                            }}
                        </FieldDescription>
                        <FieldError :errors="[errors.modality]" />
                    </Field>
                    <Field
                        v-if="entity === 'carrera'"
                        :data-invalid="Boolean(errors.campus_id)"
                    >
                        <FieldLabel :for="`edit-campus-${recordId}`" required>
                            Campus
                        </FieldLabel>
                        <Select
                            name="campus_id"
                            :default-value="campusId ?? undefined"
                            required
                        >
                            <SelectTrigger
                                :id="`edit-campus-${recordId}`"
                                :aria-invalid="Boolean(errors.campus_id)"
                            >
                                <SelectValue
                                    placeholder="Seleccione la sede aprobada"
                                />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="campus in campuses"
                                        :key="campus.id"
                                        :value="campus.id"
                                    >
                                        {{ campus.nombre }}
                                        {{ campus.activo ? '' : '(archivado)' }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldDescription>
                            Las ofertas nuevas lo heredan; las ya abiertas no
                            cambian.
                        </FieldDescription>
                        <FieldError :errors="[errors.campus_id]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.nombre)">
                        <FieldLabel :for="`edit-name-${recordId}`" required>
                            Nombre
                        </FieldLabel>
                        <Input
                            :id="`edit-name-${recordId}`"
                            name="nombre"
                            :default-value="recordName"
                            :placeholder="examples.name"
                            required
                            :aria-invalid="Boolean(errors.nombre)"
                        />
                        <FieldError :errors="[errors.nombre]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.code)">
                        <FieldLabel
                            :for="`edit-code-${recordId}`"
                            :required="entity === 'periodo'"
                        >
                            {{ codeLabel }}
                        </FieldLabel>
                        <Input
                            :id="`edit-code-${recordId}`"
                            name="code"
                            :default-value="recordCode ?? ''"
                            :placeholder="examples.code"
                            :required="entity === 'periodo'"
                            :aria-invalid="Boolean(errors.code)"
                        />
                        <FieldError :errors="[errors.code]" />
                    </Field>

                    <Field
                        v-if="entity === 'periodo'"
                        :data-invalid="Boolean(errors.starts_on)"
                    >
                        <FieldLabel
                            :for="`edit-starts-on-${recordId}`"
                            required
                        >
                            Fecha de inicio
                        </FieldLabel>
                        <DatePicker
                            :id="`edit-starts-on-${recordId}`"
                            name="starts_on"
                            :default-value="startsOn ?? ''"
                            required
                            :aria-invalid="Boolean(errors.starts_on)"
                        />
                        <FieldError :errors="[errors.starts_on]" />
                    </Field>

                    <Field
                        v-if="entity === 'periodo'"
                        :data-invalid="Boolean(errors.ends_on)"
                    >
                        <FieldLabel :for="`edit-ends-on-${recordId}`" required>
                            Fecha de fin
                        </FieldLabel>
                        <DatePicker
                            :id="`edit-ends-on-${recordId}`"
                            name="ends_on"
                            :default-value="endsOn ?? ''"
                            required
                            :aria-invalid="Boolean(errors.ends_on)"
                        />
                        <FieldError :errors="[errors.ends_on]" />
                    </Field>

                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="Check"
                        label="Guardar cambios"
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
