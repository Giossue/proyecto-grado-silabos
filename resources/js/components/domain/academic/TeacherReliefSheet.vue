<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { UserRoundCog } from '@lucide/vue';
import { computed, ref } from 'vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import DatePicker from '@/components/DatePicker.vue';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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

/**
 * Relevo de un docente en todos sus paralelos de la carrera (I-39): los sílabos en
 * curso pasan al entrante con las reglas de siempre (borrador se descarta, aprobado se
 * reabre, en revisión bloquea el relevo).
 */
const props =
    defineProps<
        Pick<AcademicStructureProps, 'teacherAssignments' | 'options'>
    >();

const outgoingTeachers = computed(() => {
    const seen = new Map<string, { id: string; name: string; count: number }>();

    for (const assignment of props.teacherAssignments) {
        if (!assignment.active || assignment.valid_until) {
            continue;
        }

        const current = seen.get(assignment.user_id);
        seen.set(assignment.user_id, {
            id: assignment.user_id,
            name: assignment.user_name,
            count: (current?.count ?? 0) + 1,
        });
    }

    return Array.from(seen.values()).sort((left, right) =>
        left.name.localeCompare(right.name, 'es'),
    );
});
const outgoing = ref('');
const replacements = computed(() =>
    props.options.teacherUsers.filter((user) => user.id !== outgoing.value),
);
// La clave hace idempotente el relevo: un doble clic no lo aplica dos veces.
const idempotencyKey = `relief-${Math.trunc(performance.now())}-${Math.random().toString(36).slice(2)}`;
</script>

<template>
    <FormSheet
        trigger-label="Relevar docente"
        title="Relevar a un docente en todos sus paralelos"
        description="Cierra la vigencia de quien sale y abre la de quien entra sobre todos los paralelos que tiene en la carrera, sílabos incluidos."
    >
        <template #trigger>
            <Button variant="outline">Relevar docente</Button>
        </template>
        <template #default="{ close }">
            <Form
                v-bind="CareerAcademicStructureController.relieveTeacher.form()"
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
                    <Alert variant="destructive">
                        <AlertDescription>
                            Los borradores sin enviar se descartan y el docente
                            entrante empieza limpio; los aprobados se reabren
                            conservando la revisión. Si hay un sílabo en
                            revisión, el relevo se rechaza hasta resolverla.
                        </AlertDescription>
                    </Alert>
                    <Field :data-invalid="Boolean(errors.outgoing_user_id)">
                        <FieldLabel for="relief-outgoing" required>
                            Docente saliente
                        </FieldLabel>
                        <input
                            type="hidden"
                            name="outgoing_user_id"
                            :value="outgoing"
                        />
                        <Select v-model="outgoing" required>
                            <SelectTrigger
                                id="relief-outgoing"
                                :aria-invalid="Boolean(errors.outgoing_user_id)"
                            >
                                <SelectValue placeholder="Seleccione" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="teacher in outgoingTeachers"
                                        :key="teacher.id"
                                        :value="teacher.id"
                                    >
                                        {{ teacher.name }}
                                        <span class="text-muted-foreground">
                                            · {{ teacher.count }}
                                            {{
                                                teacher.count === 1
                                                    ? 'paralelo'
                                                    : 'paralelos'
                                            }}
                                        </span>
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
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
                    <Field :data-invalid="Boolean(errors.backing_type)">
                        <FieldLabel for="relief-backing-type" required>
                            Documento que respalda el relevo
                        </FieldLabel>
                        <Select
                            name="backing_type"
                            default-value="accion_personal"
                            required
                        >
                            <SelectTrigger
                                id="relief-backing-type"
                                :aria-invalid="Boolean(errors.backing_type)"
                            >
                                <SelectValue placeholder="Seleccione" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="accion_personal">
                                        Acción de personal
                                    </SelectItem>
                                    <SelectItem value="resolucion">
                                        Resolución
                                    </SelectItem>
                                    <SelectItem value="oficio">
                                        Oficio
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.backing_type]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.backing_number)">
                        <FieldLabel for="relief-backing-number" required>
                            Número del documento
                        </FieldLabel>
                        <Input
                            id="relief-backing-number"
                            name="backing_number"
                            placeholder="Ej. UEB-RECT-2026-0142-R"
                            required
                            :aria-invalid="Boolean(errors.backing_number)"
                        />
                        <FieldError :errors="[errors.backing_number]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.backing_date)">
                        <FieldLabel for="relief-backing-date" required>
                            Fecha del documento
                        </FieldLabel>
                        <DatePicker
                            id="relief-backing-date"
                            name="backing_date"
                            required
                            :aria-invalid="Boolean(errors.backing_date)"
                        />
                        <FieldError :errors="[errors.backing_date]" />
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
