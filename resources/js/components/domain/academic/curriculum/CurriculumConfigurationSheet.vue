<script setup lang="ts">
import { Form } from '@inertiajs/vue3';
import { Check, Plus, Settings2 } from '@lucide/vue';
import { computed } from 'vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import FormSheet from '@/components/domain/FormSheet.vue';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    NativeSelect,
    NativeSelectOption,
} from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
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
        <Card>
            <CardHeader>
                <CardTitle>Identificación</CardTitle>
                <CardDescription>
                    El cambio de código quedará registrado en auditoría.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Form
                    v-bind="
                        CareerAcademicStructureController.update.form({
                            entity: 'curriculum',
                            record: curriculum.id,
                        })
                    "
                    v-slot="{ errors, processing }"
                    class="flex flex-col gap-4"
                >
                    <Field v-if="errors.record" data-invalid>
                        <FieldError :errors="[errors.record]" />
                    </Field>
                    <Field :data-invalid="Boolean(errors.code)">
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
                    <Button type="submit" :disabled="processing">
                        <Spinner v-if="processing" data-icon="inline-start" />
                        <Check
                            v-else
                            data-icon="inline-start"
                            aria-hidden="true"
                        />
                        Guardar código
                    </Button>
                </Form>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Ciclos</CardTitle>
                <CardDescription>
                    Puede variar entre carreras y versiones.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Form
                    v-bind="
                        CareerAcademicStructureController.updateCurriculumConfiguration.form(
                            curriculum.id,
                        )
                    "
                    v-slot="{ errors, processing }"
                    class="flex flex-col gap-4"
                >
                    <Field :data-invalid="Boolean(errors.cycle_count)">
                        <FieldLabel for="curriculum-cycle-count" required>
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
                            :aria-invalid="Boolean(errors.cycle_count)"
                        />
                        <FieldError :errors="[errors.cycle_count]" />
                    </Field>
                    <Button type="submit" :disabled="processing">
                        <Spinner v-if="processing" data-icon="inline-start" />
                        <Settings2
                            v-else
                            data-icon="inline-start"
                            aria-hidden="true"
                        />
                        Guardar ciclos
                    </Button>
                </Form>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Agregar campo de tarjeta</CardTitle>
                <CardDescription>
                    Vincúlelo a un dato estructurado o déjelo como campo propio
                    de esta malla.
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
                    class="flex flex-col gap-4"
                >
                    <FieldGroup>
                        <Field :data-invalid="Boolean(errors.label)">
                            <FieldLabel for="curriculum-field-label" required>
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
                            <FieldLabel for="curriculum-field-type" required>
                                Tipo
                            </FieldLabel>
                            <NativeSelect
                                id="curriculum-field-type"
                                name="type"
                                required
                            >
                                <NativeSelectOption value="integer"
                                    >Entero</NativeSelectOption
                                >
                                <NativeSelectOption value="number"
                                    >Decimal</NativeSelectOption
                                >
                                <NativeSelectOption value="text"
                                    >Texto</NativeSelectOption
                                >
                                <NativeSelectOption value="boolean"
                                    >Sí/No</NativeSelectOption
                                >
                            </NativeSelect>
                            <FieldError :errors="[errors.type]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.system_key)">
                            <FieldLabel for="curriculum-field-system">
                                Dato estructurado
                            </FieldLabel>
                            <NativeSelect
                                id="curriculum-field-system"
                                name="system_key"
                            >
                                <NativeSelectOption value=""
                                    >Campo adicional</NativeSelectOption
                                >
                                <NativeSelectOption
                                    v-for="option in systemFieldOptions"
                                    :key="option.value"
                                    :value="option.value"
                                >
                                    {{ option.label }}
                                </NativeSelectOption>
                            </NativeSelect>
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
                        <Field :data-invalid="Boolean(errors.visible_on_card)">
                            <FieldLabel for="curriculum-field-visible">
                                Mostrar en tarjeta
                            </FieldLabel>
                            <NativeSelect
                                id="curriculum-field-visible"
                                name="visible_on_card"
                                model-value="1"
                            >
                                <NativeSelectOption value="1"
                                    >Sí</NativeSelectOption
                                >
                                <NativeSelectOption value="0"
                                    >No</NativeSelectOption
                                >
                            </NativeSelect>
                            <FieldError :errors="[errors.visible_on_card]" />
                        </Field>
                        <Field :data-invalid="Boolean(errors.totalizable)">
                            <FieldLabel for="curriculum-field-totalizable">
                                Incluir en totales
                            </FieldLabel>
                            <NativeSelect
                                id="curriculum-field-totalizable"
                                name="totalizable"
                                model-value="0"
                            >
                                <NativeSelectOption value="0"
                                    >No</NativeSelectOption
                                >
                                <NativeSelectOption value="1"
                                    >Sí</NativeSelectOption
                                >
                            </NativeSelect>
                            <FieldError :errors="[errors.totalizable]" />
                        </Field>
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
                    </FieldGroup>
                </Form>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Campos activos</CardTitle>
                <CardDescription>
                    Retirar un campo conserva sus valores para una posible
                    recuperación.
                </CardDescription>
            </CardHeader>
            <CardContent class="flex flex-col gap-3">
                <div
                    v-for="field in fieldDefinitions"
                    :key="field.id"
                    class="flex items-center justify-between gap-3 rounded-md border p-3"
                >
                    <div class="min-w-0">
                        <p class="font-medium">{{ field.label }}</p>
                        <p class="truncate text-sm text-muted-foreground">
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
                        <Button
                            type="submit"
                            size="sm"
                            variant="outline"
                            :disabled="processing"
                            :aria-label="`Retirar el campo ${field.label}`"
                        >
                            <Spinner
                                v-if="processing"
                                data-icon="inline-start"
                            />
                            Retirar
                        </Button>
                    </Form>
                </div>
            </CardContent>
        </Card>
    </FormSheet>
</template>
