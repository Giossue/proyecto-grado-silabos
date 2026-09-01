<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Plus, Settings2, Trash2 } from '@lucide/vue';
import { computed, ref } from 'vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import type { CurriculumBuilderProps } from '@/types/academic';

const props =
    defineProps<
        Pick<
            CurriculumBuilderProps,
            'curriculum' | 'fieldDefinitions' | 'systemFieldOptions'
        >
    >();

const open = defineModel<boolean>('open', { default: false });
const nextPosition = computed(
    () =>
        Math.max(0, ...props.fieldDefinitions.map((field) => field.position)) +
        1,
);

// Reka-ui no admite items con valor vacío, así que «sin dato estructurado» se
// modela con un centinela y el valor real viaja en un input oculto.
const NO_SYSTEM_KEY = 'none';
const systemKey = ref(NO_SYSTEM_KEY);

const fieldTypeLabel = (type: string): string =>
    ({
        integer: 'Número entero',
        number: 'Número decimal',
        text: 'Texto',
        boolean: 'Sí o no',
    })[type] ?? 'Campo personalizado';
</script>

<template>
    <FormSheet
        v-model:open="open"
        trigger-label="Configurar malla"
        title="Configurar la malla"
        description="Los ciclos y campos pertenecen solo a esta versión; otras carreras pueden usar otra estructura."
        :show-trigger="false"
        full-screen
    >
        <template #default="{ close }">
            <div class="flex flex-col gap-4">
                <Form
                    v-bind="
                        CareerAcademicStructureController.updateCurriculumConfiguration.form(
                            curriculum.id,
                        )
                    "
                    v-slot="{ errors, processing }"
                >
                    <Card>
                        <CardHeader>
                            <CardTitle>Identificación y ciclos</CardTitle>
                            <CardDescription>
                                El cambio de código quedará registrado en
                                auditoría. Los ciclos pueden variar entre
                                carreras y versiones.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Field v-if="errors.record" data-invalid>
                                <FieldError :errors="[errors.record]" />
                            </Field>
                            <div
                                class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
                            >
                                <Field
                                    class="lg:col-span-3"
                                    :data-invalid="Boolean(errors.code)"
                                >
                                    <FieldLabel for="curriculum-code" required>
                                        Código
                                    </FieldLabel>
                                    <Input
                                        id="curriculum-code"
                                        name="code"
                                        :default-value="curriculum.code"
                                        placeholder="Ej. MALLA-SW-2026"
                                        required
                                        :aria-invalid="Boolean(errors.code)"
                                    />
                                    <FieldError :errors="[errors.code]" />
                                </Field>
                                <Field
                                    :data-invalid="Boolean(errors.cycle_count)"
                                >
                                    <FieldLabel
                                        for="curriculum-cycle-count"
                                        required
                                    >
                                        Cantidad de ciclos
                                    </FieldLabel>
                                    <Input
                                        id="curriculum-cycle-count"
                                        name="cycle_count"
                                        type="number"
                                        min="1"
                                        max="30"
                                        :default-value="curriculum.cycle_count"
                                        required
                                        :aria-invalid="
                                            Boolean(errors.cycle_count)
                                        "
                                    />
                                    <FieldError
                                        :errors="[errors.cycle_count]"
                                    />
                                </Field>
                            </div>
                        </CardContent>
                    </Card>

                    <FormSheetActions
                        :close="close"
                        :processing="processing"
                        :icon="Settings2"
                        label="Guardar configuración"
                    />
                </Form>

                <Card>
                    <CardHeader>
                        <CardTitle>Agregar campo de tarjeta</CardTitle>
                        <CardDescription>
                            Vincúlelo a un dato estructurado o déjelo como campo
                            propio de esta malla.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Form
                            v-bind="
                                CareerAcademicStructureController.storeCurriculumField.form(
                                    curriculum.id,
                                )
                            "
                            v-slot="{ errors, processing }"
                            reset-on-success
                            class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
                            @success="systemKey = NO_SYSTEM_KEY"
                        >
                            <Field :data-invalid="Boolean(errors.label)">
                                <FieldLabel
                                    for="curriculum-field-label"
                                    required
                                >
                                    Etiqueta visible
                                </FieldLabel>
                                <Input
                                    id="curriculum-field-label"
                                    name="label"
                                    placeholder="Ej. ACD"
                                    required
                                    :aria-invalid="Boolean(errors.label)"
                                />
                                <FieldError :errors="[errors.label]" />
                            </Field>
                            <Field :data-invalid="Boolean(errors.key)">
                                <FieldLabel for="curriculum-field-key" required>
                                    Código de referencia
                                </FieldLabel>
                                <Input
                                    id="curriculum-field-key"
                                    name="key"
                                    placeholder="Ej. horas_laboratorio"
                                    pattern="[a-z][a-z0-9_]*"
                                    required
                                    :aria-invalid="Boolean(errors.key)"
                                />
                                <FieldError :errors="[errors.key]" />
                            </Field>
                            <Field :data-invalid="Boolean(errors.type)">
                                <FieldLabel
                                    for="curriculum-field-type"
                                    required
                                >
                                    Tipo
                                </FieldLabel>
                                <Select
                                    name="type"
                                    default-value="integer"
                                    required
                                >
                                    <SelectTrigger
                                        id="curriculum-field-type"
                                        class="w-full"
                                        :aria-invalid="Boolean(errors.type)"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="integer">
                                            Entero
                                        </SelectItem>
                                        <SelectItem value="number">
                                            Decimal
                                        </SelectItem>
                                        <SelectItem value="text">
                                            Texto
                                        </SelectItem>
                                        <SelectItem value="boolean">
                                            Sí/No
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                                <FieldError :errors="[errors.type]" />
                            </Field>
                            <Field :data-invalid="Boolean(errors.system_key)">
                                <FieldLabel for="curriculum-field-system">
                                    Dato estructurado
                                </FieldLabel>
                                <Select v-model="systemKey">
                                    <SelectTrigger
                                        id="curriculum-field-system"
                                        class="w-full"
                                        :aria-invalid="
                                            Boolean(errors.system_key)
                                        "
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem :value="NO_SYSTEM_KEY">
                                            Campo adicional
                                        </SelectItem>
                                        <SelectItem
                                            v-for="option in systemFieldOptions"
                                            :key="option.value"
                                            :value="option.value"
                                        >
                                            {{ option.label }}
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                                <input
                                    type="hidden"
                                    name="system_key"
                                    :value="
                                        systemKey === NO_SYSTEM_KEY
                                            ? ''
                                            : systemKey
                                    "
                                />
                                <FieldError :errors="[errors.system_key]" />
                            </Field>
                            <Field :data-invalid="Boolean(errors.position)">
                                <FieldLabel for="curriculum-field-position">
                                    Posición
                                </FieldLabel>
                                <Input
                                    id="curriculum-field-position"
                                    name="position"
                                    type="number"
                                    min="0"
                                    :default-value="nextPosition"
                                />
                                <FieldError :errors="[errors.position]" />
                            </Field>
                            <Field
                                :data-invalid="Boolean(errors.visible_on_card)"
                            >
                                <FieldLabel for="curriculum-field-visible">
                                    Mostrar en tarjeta
                                </FieldLabel>
                                <Select
                                    name="visible_on_card"
                                    default-value="1"
                                >
                                    <SelectTrigger
                                        id="curriculum-field-visible"
                                        class="w-full"
                                        :aria-invalid="
                                            Boolean(errors.visible_on_card)
                                        "
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="1">Sí</SelectItem>
                                        <SelectItem value="0">No</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FieldError :errors="[errors.visible_on_card]" />
                            </Field>
                            <Field :data-invalid="Boolean(errors.totalizable)">
                                <FieldLabel for="curriculum-field-totalizable">
                                    Incluir en totales
                                </FieldLabel>
                                <Select name="totalizable" default-value="0">
                                    <SelectTrigger
                                        id="curriculum-field-totalizable"
                                        class="w-full"
                                        :aria-invalid="
                                            Boolean(errors.totalizable)
                                        "
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="0">No</SelectItem>
                                        <SelectItem value="1">Sí</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FieldError :errors="[errors.totalizable]" />
                            </Field>
                            <div class="flex items-end justify-end">
                                <Button type="submit" :disabled="processing">
                                    <Spinner
                                        v-if="processing"
                                        data-icon="inline-start"
                                    />
                                    <Plus
                                        v-else
                                        data-icon="inline-start"
                                        aria-hidden="true"
                                    />
                                    Agregar campo
                                </Button>
                            </div>
                        </Form>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Campos activos</CardTitle>
                        <CardDescription>
                            Retirar un campo conserva sus valores para una
                            posible recuperación.
                        </CardDescription>
                    </CardHeader>
                    <CardContent
                        class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
                    >
                        <div
                            v-for="field in fieldDefinitions"
                            :key="field.id"
                            class="flex items-center justify-between gap-3 rounded-md border p-3"
                        >
                            <div class="min-w-0">
                                <p class="font-medium">{{ field.label }}</p>
                                <p
                                    class="truncate text-sm text-muted-foreground"
                                >
                                    {{ fieldTypeLabel(field.type) }}
                                </p>
                            </div>
                            <Form
                                v-bind="
                                    CareerAcademicStructureController.destroyCurriculumField.form(
                                        {
                                            curriculum: curriculum.id,
                                            field: field.id,
                                        },
                                    )
                                "
                                v-slot="{ processing }"
                            >
                                <Tooltip>
                                    <TooltipTrigger as-child>
                                        <Button
                                            type="submit"
                                            size="icon-sm"
                                            variant="outline"
                                            :disabled="processing"
                                            :aria-label="`Retirar el campo ${field.label}`"
                                        >
                                            <Spinner v-if="processing" />
                                            <Trash2
                                                v-else
                                                aria-hidden="true"
                                            />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Retirar</TooltipContent>
                                </Tooltip>
                            </Form>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </template>
    </FormSheet>
</template>
