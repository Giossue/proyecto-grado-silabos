<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { UserRoundCog } from '@lucide/vue';
import { computed } from 'vue';
import AcademicGovernanceController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/AcademicGovernanceController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldContent,
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
import type { Option } from '@/types/academic';

/**
 * Nombrar o reemplazar la coordinación de una carrera en un paso (I-39): quien sale
 * pierde el nombramiento y el rol en esta carrera; quien entra recibe ambos. Si quien
 * sale ya no tiene otro rol, puede desactivarse aquí mismo.
 */
const props = defineProps<{
    careerId: string;
    careerName: string;
    coordinator: { id: string; name: string } | null;
    users: Option[];
}>();

const open = defineModel<boolean>('open', { default: false });
const candidates = computed(() =>
    props.users.filter((user) => user.id !== props.coordinator?.id),
);
</script>

<template>
    <FormSheet
        v-model:open="open"
        :trigger-label="
            coordinator ? 'Reemplazar coordinador' : 'Asignar coordinador'
        "
        :title="
            coordinator
                ? `Reemplazar la coordinación de ${careerName}`
                : `Asignar la coordinación de ${careerName}`
        "
        :description="
            coordinator
                ? `${coordinator.name} deja de coordinar en este momento; la persona entrante recibe el rol y el nombramiento. Malla, ofertas y convocatorias siguen siendo de la carrera.`
                : 'La persona entrante recibe el rol de coordinación y el nombramiento de la carrera.'
        "
        :show-trigger="false"
    >
        <template #default="{ close }">
            <Form
                v-bind="
                    AcademicGovernanceController.replaceCoordinator.form(
                        careerId,
                    )
                "
                v-slot="{ errors, processing }"
                reset-on-success
                @success="close"
            >
                <FieldGroup>
                    <Field :data-invalid="Boolean(errors.incoming_user_id)">
                        <FieldLabel
                            :for="`coordinator-incoming-${careerId}`"
                            required
                        >
                            Persona entrante
                        </FieldLabel>
                        <Select name="incoming_user_id" required>
                            <SelectTrigger
                                :id="`coordinator-incoming-${careerId}`"
                                :aria-invalid="Boolean(errors.incoming_user_id)"
                            >
                                <SelectValue placeholder="Seleccione" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="user in candidates"
                                        :key="user.id"
                                        :value="user.id"
                                    >
                                        {{ user.nombre }}
                                        <span class="text-muted-foreground">
                                            · {{ user.correo_electronico }}
                                        </span>
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        <FieldError :errors="[errors.incoming_user_id]" />
                    </Field>
                    <Field
                        v-if="coordinator"
                        orientation="horizontal"
                        :data-invalid="Boolean(errors.deactivate_outgoing)"
                    >
                        <input
                            type="hidden"
                            name="deactivate_outgoing"
                            value="0"
                        />
                        <Checkbox
                            :id="`coordinator-deactivate-${careerId}`"
                            name="deactivate_outgoing"
                            value="1"
                        />
                        <FieldContent>
                            <FieldLabel
                                :for="`coordinator-deactivate-${careerId}`"
                            >
                                Desactivar la cuenta de {{ coordinator.name }} si
                                no le queda otro rol
                            </FieldLabel>
                            <FieldError :errors="[errors.deactivate_outgoing]" />
                        </FieldContent>
                    </Field>
                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="UserRoundCog"
                        :label="
                            coordinator
                                ? 'Reemplazar coordinación'
                                : 'Asignar coordinación'
                        "
                    />
                </FieldGroup>
            </Form>
        </template>
    </FormSheet>
</template>
