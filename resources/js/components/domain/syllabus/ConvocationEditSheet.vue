<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Check } from '@lucide/vue';
import ConvocationController from '@/actions/App/Modules/Syllabus/Presentation/Http/Controllers/ConvocationController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
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

/*
 * Se corrige antes de abrir o en pausa. Antes de abrir se cambia todo; en pausa, solo el
 * nombre y las fuentes: el periodo y la agrupación ya generaron expedientes.
 */
const props = defineProps<{
    convocation: {
        id: string;
        name: string;
        state: string;
        grouping_mode: string;
        source_ids: string[];
    };
    sources: { id: string; label: string }[];
}>();

const open = defineModel<boolean>('open', { default: false });
const preparing = props.convocation.state === 'preparacion';
</script>

<template>
    <FormSheet
        v-model:open="open"
        trigger-label="Editar"
        :title="`Editar ${convocation.name}`"
        :description="
            preparing
                ? 'Corrija el nombre, la agrupación o las fuentes antes de abrir. El período viene del proceso institucional.'
                : 'En pausa solo se corrigen el nombre y las fuentes: el período y la agrupación ya generaron expedientes.'
        "
        :show-trigger="false"
    >
        <template #default="{ close }">
            <Form
                :key="convocation.id"
                v-bind="ConvocationController.update.form(convocation.id)"
                v-slot="{ errors, processing }"
                @success="close"
            >
                <FieldGroup>
                    <Field v-if="errors.convocation" data-invalid>
                        <FieldError :errors="[errors.convocation]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.nombre)">
                        <FieldLabel
                            :for="`convocation-edit-name-${convocation.id}`"
                            required
                        >
                            Nombre
                        </FieldLabel>
                        <Input
                            :id="`convocation-edit-name-${convocation.id}`"
                            name="nombre"
                            :default-value="convocation.name"
                            :aria-invalid="Boolean(errors.nombre)"
                            placeholder="Ej. Elaboración de sílabos 2026-2027"
                            required
                        />
                        <FieldError :errors="[errors.nombre]" />
                    </Field>

                    <template v-if="preparing">
                        <Field :data-invalid="Boolean(errors.grouping_mode)">
                            <FieldLabel
                                :for="`convocation-edit-grouping-${convocation.id}`"
                                required
                            >
                                Agrupación explícita
                            </FieldLabel>
                            <Select
                                name="grouping_mode"
                                :default-value="convocation.grouping_mode"
                                required
                            >
                                <SelectTrigger
                                    :id="`convocation-edit-grouping-${convocation.id}`"
                                    :aria-invalid="
                                        Boolean(errors.grouping_mode)
                                    "
                                >
                                    <SelectValue placeholder="Seleccione" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem value="por_oferta"
                                            >Un sílabo por oferta</SelectItem
                                        >
                                        <SelectItem value="por_paralelo"
                                            >Un sílabo por paralelo</SelectItem
                                        >
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                            <FieldError :errors="[errors.grouping_mode]" />
                        </Field>
                    </template>

                    <FieldSet>
                        <FieldLegend variant="label" required
                            >Fuentes académicas</FieldLegend
                        >
                        <FieldError
                            :errors="[
                                errors.source_ids,
                                errors['source_ids.0'],
                            ]"
                        />
                        <div class="grid gap-3">
                            <Field
                                v-for="source in sources"
                                :key="source.id"
                                orientation="horizontal"
                            >
                                <Checkbox
                                    :id="`convocation-edit-source-${convocation.id}-${source.id}`"
                                    name="source_ids[]"
                                    :value="source.id"
                                    :default-value="
                                        convocation.source_ids.includes(
                                            source.id,
                                        )
                                    "
                                />
                                <FieldLabel
                                    :for="`convocation-edit-source-${convocation.id}-${source.id}`"
                                >
                                    {{ source.label }}
                                </FieldLabel>
                            </Field>
                        </div>
                    </FieldSet>

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
