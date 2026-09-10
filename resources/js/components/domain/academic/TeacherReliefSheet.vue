<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { UserRoundCog } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { AcademicStructureProps } from '@/types/academic';

const props = defineProps<{
    outgoingTeacher: {
        id: string;
        name: string;
        parallelCount: number;
    };
    options: AcademicStructureProps['options'];
}>();

const open = defineModel<boolean>('open', { default: false });
const replacements = computed(() =>
    props.options.teacherUsers.filter(
        (user) => user.id !== props.outgoingTeacher.id,
    ),
);
const impactLabel = computed(
    () =>
        `${props.outgoingTeacher.parallelCount} ${
            props.outgoingTeacher.parallelCount === 1
                ? 'paralelo vigente'
                : 'paralelos vigentes'
        }`,
);
const createIdempotencyKey = (): string =>
    `relief-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const idempotencyKey = ref(createIdempotencyKey());

watch(open, (isOpen) => {
    if (isOpen) {
        idempotencyKey.value = createIdempotencyKey();
    }
});
</script>

<template>
    <FormSheet
        v-model:open="open"
        trigger-label="Relevar docente"
        :title="`Relevar a ${outgoingTeacher.name}`"
        :description="`Transfiera ${impactLabel} a otro docente de la carrera.`"
        :show-trigger="false"
    >
        <template #default="{ close }">
            <Form
                v-bind="CareerAcademicStructureController.relieveTeacher.form()"
                v-slot="{ errors, processing }"
                reset-on-success
                @success="close"
            >
                <input
                    type="hidden"
                    name="outgoing_user_id"
                    :value="outgoingTeacher.id"
                />
                <input
                    type="hidden"
                    name="idempotency_key"
                    :value="idempotencyKey"
                />
                <FieldGroup>
                    <Alert>
                        <AlertDescription>
                            Los sílabos relacionados también pasarán al docente
                            entrante. Los borradores sin enviar empezarán de
                            nuevo, los aprobados conservarán su revisión y el
                            cambio se bloqueará si existe un sílabo en revisión.
                        </AlertDescription>
                    </Alert>
                    <Field v-if="errors.outgoing_user_id" data-invalid>
                        <FieldError :errors="[errors.outgoing_user_id]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.incoming_user_id)">
                        <FieldLabel for="relief-incoming" required>
                            Docente entrante
                        </FieldLabel>
                        <Select name="incoming_user_id" required>
                            <SelectTrigger
                                id="relief-incoming"
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
                                        {{ teacher.nombre }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.incoming_user_id]" />
                    </Field>
                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="UserRoundCog"
                        label="Aplicar relevo"
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
