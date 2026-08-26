<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Pencil } from '@lucide/vue';
import { computed } from 'vue';
import AcademicGovernanceController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/AcademicGovernanceController';
import FormSheet from '@/components/domain/FormSheet.vue';
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
import { Spinner } from '@/components/ui/spinner';
import type { CatalogRecord, GovernanceCatalogEntity } from '@/types/academic';

const props = withDefaults(
    defineProps<{
        entity: GovernanceCatalogEntity;
        recordId: string;
        recordName: string;
        recordCode: string | null;
        facultyId?: string | null;
        startsOn?: string | null;
        endsOn?: string | null;
        faculties: CatalogRecord[];
        showTrigger?: boolean;
    }>(),
    {
        showTrigger: true,
    },
);

const open = defineModel<boolean>('open', { default: false });

const entityLabel = computed(
    () =>
        ({
            faculty: 'facultad',
            career: 'carrera',
            campus: 'campus',
            modality: 'modalidad',
            period: 'periodo académico',
        })[props.entity],
);

const codeLabel = computed(() =>
    ['modality', 'period'].includes(props.entity)
        ? 'Código estable'
        : 'Código institucional',
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
            <Button type="button" size="sm" variant="outline">
                <Pencil data-icon="inline-start" />
                Editar
            </Button>
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
                        v-if="entity === 'career'"
                        :data-invalid="Boolean(errors.faculty_id)"
                    >
                        <FieldLabel :for="`edit-faculty-${recordId}`">
                            Facultad
                        </FieldLabel>
                        <Select
                            name="faculty_id"
                            :default-value="facultyId ?? undefined"
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

                    <Field :data-invalid="Boolean(errors.name)">
                        <FieldLabel :for="`edit-name-${recordId}`">
                            Nombre
                        </FieldLabel>
                        <Input
                            :id="`edit-name-${recordId}`"
                            name="name"
                            :default-value="recordName"
                            required
                            :aria-invalid="Boolean(errors.name)"
                        />
                        <FieldError :errors="[errors.name]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.code)">
                        <FieldLabel :for="`edit-code-${recordId}`">
                            {{ codeLabel }}
                        </FieldLabel>
                        <Input
                            :id="`edit-code-${recordId}`"
                            name="code"
                            :default-value="recordCode ?? ''"
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
                        <FieldLabel :for="`edit-starts-on-${recordId}`">
                            Fecha de inicio
                        </FieldLabel>
                        <Input
                            :id="`edit-starts-on-${recordId}`"
                            name="starts_on"
                            type="date"
                            :default-value="startsOn ?? ''"
                            required
                            :aria-invalid="Boolean(errors.starts_on)"
                        />
                        <FieldError :errors="[errors.starts_on]" />
                    </Field>

                    <Field
                        v-if="entity === 'period'"
                        :data-invalid="Boolean(errors.ends_on)"
                    >
                        <FieldLabel :for="`edit-ends-on-${recordId}`">
                            Fecha de fin
                        </FieldLabel>
                        <Input
                            :id="`edit-ends-on-${recordId}`"
                            name="ends_on"
                            type="date"
                            :default-value="endsOn ?? ''"
                            required
                            :aria-invalid="Boolean(errors.ends_on)"
                        />
                        <FieldError :errors="[errors.ends_on]" />
                    </Field>

                    <Field orientation="horizontal">
                        <Button type="submit" :disabled="processing">
                            <Spinner
                                v-if="processing"
                                data-icon="inline-start"
                            />
                            Guardar cambios
                        </Button>
                    </Field>
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
