<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { UserRoundCog } from '@lucide/vue';
import { computed, ref } from 'vue';
import ReviewController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/ReviewController';
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

type Teacher = { id: string; name: string };

const props = defineProps<{
    syllabusId: string;
    state: string;
    current: Teacher[];
    candidates: Teacher[];
}>();

const outgoing = ref(props.current[0]?.id ?? '');

// El reemplazo no puede ser quien ya está: la elección se filtra en la propia lista para
// que el error no aparezca solo después de enviar.
const replacements = computed(() =>
    props.candidates.filter((teacher) => teacher.id !== outgoing.value),
);

// El borrador sin enviar se descarta (DT-08). Se avisa antes, porque no se deshace.
const discardsDraft = computed(() => props.state === 'draft');

// La clave hace idempotente el relevo: un doble clic no abre dos asignaciones.
const idempotencyKey = `transfer-${props.syllabusId}-${Math.trunc(performance.now())}`;
</script>

<template>
    <FormSheet
        trigger-label="Relevar docente"
        title="Relevar al docente responsable"
        description="Cierra la vigencia de quien sale y abre la de quien entra sobre los mismos paralelos, en una sola operación."
    >
        <template #trigger>
            <Button>
                <UserRoundCog data-icon="inline-start" aria-hidden="true" />
                Relevar docente
            </Button>
        </template>
        <template #default="{ close }">
            <Form
                v-bind="ReviewController.transferTeacher.form(syllabusId)"
                v-slot="{ errors, processing }"
                reset-on-success
                @success="close"
            >
                <input
                    type="hidden"
                    name="idempotency_key"
                    :value="idempotencyKey"
                />
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.outgoing_user_id)">
                        <FieldLabel for="transfer-outgoing">
                            Docente saliente
                        </FieldLabel>
                        <Select v-model="outgoing" name="outgoing_user_id">
                            <SelectTrigger
                                id="transfer-outgoing"
                                :aria-invalid="Boolean(errors.outgoing_user_id)"
                            >
                                <SelectValue placeholder="Seleccione" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="teacher in current"
                                        :key="teacher.id"
                                        :value="teacher.id"
                                    >
                                        {{ teacher.name }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.outgoing_user_id]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.incoming_user_id)">
                        <FieldLabel for="transfer-incoming">
                            Docente entrante
                        </FieldLabel>
                        <Select name="incoming_user_id">
                            <SelectTrigger
                                id="transfer-incoming"
                                :aria-invalid="Boolean(errors.incoming_user_id)"
                            >
                                <SelectValue placeholder="Seleccione" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="teacher in replacements"
                                        :key="teacher.id"
                                        :value="teacher.id"
                                    >
                                        {{ teacher.name }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldDescription>
                            Solo docentes con rol vigente en esta carrera.
                        </FieldDescription>
                        <FieldError :errors="[errors.incoming_user_id]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.backing_type)">
                        <FieldLabel for="transfer-backing-type">
                            Documento que respalda el relevo
                        </FieldLabel>
                        <Select
                            name="backing_type"
                            default-value="personnel_action"
                        >
                            <SelectTrigger
                                id="transfer-backing-type"
                                :aria-invalid="Boolean(errors.backing_type)"
                            >
                                <SelectValue placeholder="Seleccione" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="personnel_action">
                                        Acción de personal
                                    </SelectItem>
                                    <SelectItem value="resolution">
                                        Resolución
                                    </SelectItem>
                                    <SelectItem value="official_letter">
                                        Oficio
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.backing_type]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.backing_number)">
                        <FieldLabel for="transfer-backing-number">
                            Número
                        </FieldLabel>
                        <Input
                            id="transfer-backing-number"
                            name="backing_number"
                            :aria-invalid="Boolean(errors.backing_number)"
                            placeholder="UEB-RECT-2026-0142-R"
                            required
                        />
                        <FieldError :errors="[errors.backing_number]" />
                    </Field>

                    <Field :data-invalid="Boolean(errors.backing_date)">
                        <FieldLabel for="transfer-backing-date">
                            Fecha del documento
                        </FieldLabel>
                        <Input
                            id="transfer-backing-date"
                            name="backing_date"
                            type="date"
                            :aria-invalid="Boolean(errors.backing_date)"
                            required
                        />
                        <FieldError
                            :errors="[errors.backing_date, errors.syllabus]"
                        />
                    </Field>

                    <FieldDescription v-if="discardsDraft">
                        El borrador que no se ha enviado se descartará y el
                        docente entrante empezará limpio. La operación no se
                        deshace; el avance perdido queda registrado en
                        auditoría.
                    </FieldDescription>

                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="UserRoundCog"
                        label="Registrar relevo"
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
