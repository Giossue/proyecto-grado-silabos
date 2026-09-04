<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { UserPlus } from '@lucide/vue';
import { computed, ref } from 'vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import SearchableOptionSelect from '@/components/domain/SearchableOptionSelect.vue';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import type { AcademicStructureProps } from '@/types/academic';

const props = defineProps<Pick<AcademicStructureProps, 'options'>>();
const selectionKey = ref(0);
const teacherOptions = computed(() =>
    props.options.teacherUsers.map((teacher) => ({
        id: teacher.id,
        label: `${teacher.name ?? teacher.nombre ?? ''} · ${teacher.email ?? teacher.correo_electronico ?? ''}`,
    })),
);
const parallelOptions = computed(() =>
    props.options.parallels.map((parallel) => ({
        id: parallel.id,
        label: parallel.label ?? '',
    })),
);
const closeAfterSuccess = (close: () => void): void => {
    selectionKey.value++;
    close();
};
</script>

<template>
    <FormSheet
        trigger-label="Asignar docente"
        title="Asignar docente"
        description="Seleccione una cuenta con rol Docente y vigencia laboral actual, y un paralelo perteneciente a esta carrera."
    >
        <template #default="{ close }">
            <Form
                v-bind="
                    CareerAcademicStructureController.store.form(
                        'asignacion_docente',
                    )
                "
                v-slot="{ errors, processing }"
                reset-on-success
                @success="closeAfterSuccess(close)"
            >
                <FieldGroup :key="selectionKey">
                    <Field :data-invalid="Boolean(errors.user_id)">
                        <FieldLabel for="teacher-user" required>
                            Docente
                        </FieldLabel>
                        <SearchableOptionSelect
                            id="teacher-user"
                            name="user_id"
                            :options="teacherOptions"
                            placeholder="Seleccione un docente"
                            search-placeholder="Buscar por nombre o correo…"
                            empty-label="No hay docentes que coincidan."
                            :invalid="Boolean(errors.user_id)"
                        />
                        <FieldError :errors="[errors.user_id]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.parallel_id)">
                        <FieldLabel for="teacher-parallel" required>
                            Materia, periodo y paralelo
                        </FieldLabel>
                        <SearchableOptionSelect
                            id="teacher-parallel"
                            name="parallel_id"
                            :options="parallelOptions"
                            placeholder="Seleccione un paralelo"
                            search-placeholder="Buscar materia, período o paralelo…"
                            empty-label="No hay paralelos que coincidan."
                            :invalid="Boolean(errors.parallel_id)"
                        />
                        <FieldError :errors="[errors.parallel_id]" />
                    </Field>
                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="UserPlus"
                        label="Asignar docencia"
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
