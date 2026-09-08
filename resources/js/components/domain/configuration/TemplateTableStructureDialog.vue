<script setup lang="ts">
import { useForm } from '@inertiajs/vue3';
import { ArrowDown, ArrowUp, Plus, Save, Settings2, Trash2 } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { toast } from 'vue-sonner';
import TemplateController from '@/actions/App/Modules/Configuration/Presentation/Http/Controllers/TemplateController';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Field,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
    FieldTitle,
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
import {
    cloneTableLayout,
    defaultTableLayout,
    tableKeyFor,
} from '@/lib/tableLayout';
import type {
    TableColumn,
    TableColumnRole,
    TableColumnType,
    TableLayout,
} from '@/lib/tableLayout';

const props = defineProps<{
    templateId: string;
    blockId: string;
    fingerprint: string;
    layout: TableLayout | null;
}>();

const emit = defineEmits<{ saved: [] }>();
const open = ref(false);

const initialLayout = (): TableLayout =>
    cloneTableLayout(props.layout ?? defaultTableLayout());
const form = useForm({
    fingerprint: props.fingerprint,
    ...initialLayout(),
    confirm_purge: false,
});

const roleOptions: { value: TableColumnRole; label: string }[] = [
    { value: 'week', label: 'Semana de planificación' },
    { value: 'hours_acd', label: 'Horas ACD' },
    { value: 'hours_ape', label: 'Horas APE' },
    { value: 'hours_aa', label: 'Horas AA' },
];

const errorFor = (path: string): string | undefined =>
    (form.errors as Record<string, string>)[path];
const error = computed(() =>
    Object.entries(form.errors)
        .filter(
            ([key, value]) =>
                Boolean(value) &&
                !['purge_count', 'purge_required'].includes(key),
        )
        .map(([, value]) => value)
        .join(' '),
);
const purge = computed(
    () => (form.errors as Record<string, string>).purge_required,
);
const canSubmit = computed(
    () =>
        form.columns.length > 0 &&
        form.columns.every((column) => column.label.trim() !== '') &&
        (!form.repeat.enabled ||
            (form.repeat.label.trim() !== '' &&
                form.header_fields.every(
                    (field) => field.label.trim() !== '',
                ))) &&
        (!form.totals.enabled || form.totals.label.trim() !== ''),
);

const reset = (): void => {
    const layout = initialLayout();

    form.fingerprint = props.fingerprint;
    form.columns = layout.columns;
    form.groups = layout.groups;
    form.bands = layout.bands;
    form.header_fields = layout.header_fields;
    form.totals = layout.totals;
    form.repeat = layout.repeat;
    form.confirm_purge = false;
    form.clearErrors();
};

const updateOpen = (value: boolean): void => {
    if (!value && form.processing) {
        return;
    }

    open.value = value;

    if (value) {
        reset();
    }
};

watch(
    () => props.fingerprint,
    () => {
        if (!open.value) {
            reset();
        }
    },
);

const move = <T,>(items: T[], index: number, offset: -1 | 1): void => {
    const target = index + offset;

    if (target < 0 || target >= items.length) {
        return;
    }

    [items[index], items[target]] = [items[target], items[index]];
};

const addColumn = (): void => {
    if (form.columns.length >= 24) {
        return;
    }

    const label = `Columna ${form.columns.length + 1}`;
    form.columns.push({
        key: tableKeyFor(
            label,
            form.columns.map((column) => column.key),
        ),
        label,
        type: 'text',
        group: null,
        band: null,
        sum: false,
        width: null,
        role: null,
    });
};

const removeColumn = (index: number): void => {
    if (form.columns.length > 1) {
        form.columns.splice(index, 1);
    }
};

const addHeaderField = (): void => {
    if (form.header_fields.length >= 12) {
        return;
    }

    const label = `Dato de la unidad ${form.header_fields.length + 1}`;
    form.header_fields.push({
        key: tableKeyFor(
            label,
            form.header_fields.map((field) => field.key),
        ),
        label,
    });
};

const setColumnType = (column: TableColumn, value: unknown): void => {
    if (value !== 'text' && value !== 'number') {
        return;
    }

    column.type = value as TableColumnType;

    if (column.type === 'text') {
        column.sum = false;
        column.role = null;
    }
};

const setColumnRole = (column: TableColumn, value: unknown): void => {
    const role = roleOptions.find((option) => option.value === value)?.value;

    column.role = role ?? null;

    if (role) {
        column.type = 'number';

        if (role === 'week') {
            column.sum = false;
        }
    }
};

const submit = (confirmPurge = false): void => {
    form.confirm_purge = confirmPurge;
    form.transform((data) => ({
        ...data,
        header_fields: data.repeat.enabled ? data.header_fields : [],
        columns: data.columns.map((column) => ({
            ...column,
            sum:
                column.type === 'number' && column.role !== 'week'
                    ? Boolean(column.sum)
                    : false,
        })),
    }));
    form.patch(
        TemplateController.updateTableLayout.url({
            template: props.templateId,
            block: props.blockId,
        }),
        {
            preserveScroll: true,
            onSuccess: () => {
                toast.success('Estructura de la tabla guardada.');
                open.value = false;
                emit('saved');
            },
            onError: (errors) => {
                if (!('purge_required' in errors)) {
                    toast.error(
                        Object.values(errors)[0] ??
                            'No se pudo guardar la estructura.',
                    );
                }
            },
        },
    );
};
</script>

<template>
    <Dialog :open="open" @update:open="updateOpen">
        <DialogTrigger as-child>
            <Button type="button" variant="outline" size="sm">
                <Settings2 data-icon="inline-start" aria-hidden="true" />
                Configurar estructura
            </Button>
        </DialogTrigger>

        <DialogContent
            class="flex max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
        >
            <DialogHeader class="shrink-0 border-b px-6 py-4 pr-12">
                <DialogTitle>Configurar estructura de la tabla</DialogTitle>
                <DialogDescription>
                    Defina qué completa el docente. Los datos repetibles se
                    mostrarán con $, mientras que @ seguirá reservado para datos
                    automáticos.
                </DialogDescription>
            </DialogHeader>

            <form
                class="flex min-h-0 flex-1 flex-col"
                @submit.prevent="submit()"
            >
                <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                    <FieldGroup>
                        <Alert>
                            <AlertTitle>Se reconstruirá el molde</AlertTitle>
                            <AlertDescription>
                                Al guardar se restablecen las combinaciones y
                                estilos particulares de esta tabla. Después
                                puede aplicarlos nuevamente desde Editar tabla.
                            </AlertDescription>
                        </Alert>

                        <Field orientation="horizontal">
                            <Checkbox
                                id="table-repeat-units"
                                :model-value="form.repeat.enabled"
                                :disabled="form.processing"
                                @update:model-value="
                                    form.repeat.enabled = $event === true
                                "
                            />
                            <FieldLabel for="table-repeat-units">
                                <FieldTitle>Organizar por unidades</FieldTitle>
                                <FieldDescription>
                                    Permite que Docencia agregue tantas unidades
                                    y filas como necesite.
                                </FieldDescription>
                            </FieldLabel>
                        </Field>

                        <FieldGroup
                            v-if="form.repeat.enabled"
                            class="rounded-lg border p-4"
                        >
                            <Field
                                :data-invalid="
                                    Boolean(errorFor('repeat.label'))
                                "
                            >
                                <FieldLabel for="table-unit-label" required>
                                    Nombre del grupo repetible
                                </FieldLabel>
                                <Input
                                    id="table-unit-label"
                                    v-model="form.repeat.label"
                                    maxlength="180"
                                    placeholder="Ej. Unidad"
                                    :disabled="form.processing"
                                    :aria-invalid="
                                        Boolean(errorFor('repeat.label'))
                                    "
                                />
                                <FieldError
                                    v-if="errorFor('repeat.label')"
                                    :errors="[errorFor('repeat.label')]"
                                />
                            </Field>

                            <div
                                class="flex items-center justify-between gap-3"
                            >
                                <div>
                                    <p class="text-sm font-medium">
                                        Datos de cada unidad
                                    </p>
                                    <p class="text-sm text-muted-foreground">
                                        Se completan una vez al comenzar cada
                                        unidad.
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    :disabled="
                                        form.processing ||
                                        form.header_fields.length >= 12
                                    "
                                    @click="addHeaderField"
                                >
                                    <Plus
                                        data-icon="inline-start"
                                        aria-hidden="true"
                                    />
                                    Agregar dato
                                </Button>
                            </div>

                            <p
                                v-if="form.header_fields.length === 0"
                                class="rounded-md border border-dashed p-3 text-sm text-muted-foreground"
                            >
                                La unidad solo mostrará su número.
                            </p>

                            <Field
                                v-for="(field, index) in form.header_fields"
                                :key="field.key"
                                :data-invalid="
                                    Boolean(
                                        errorFor(
                                            `header_fields.${index}.label`,
                                        ),
                                    )
                                "
                            >
                                <div class="flex items-center gap-2">
                                    <Input
                                        v-model="field.label"
                                        :aria-label="`Nombre del dato de unidad ${index + 1}`"
                                        maxlength="180"
                                        :disabled="form.processing"
                                        :aria-invalid="
                                            Boolean(
                                                errorFor(
                                                    `header_fields.${index}.label`,
                                                ),
                                            )
                                        "
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        :disabled="
                                            form.processing || index === 0
                                        "
                                        :aria-label="`Subir ${field.label}`"
                                        @click="
                                            move(form.header_fields, index, -1)
                                        "
                                    >
                                        <ArrowUp aria-hidden="true" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        :disabled="
                                            form.processing ||
                                            index ===
                                                form.header_fields.length - 1
                                        "
                                        :aria-label="`Bajar ${field.label}`"
                                        @click="
                                            move(form.header_fields, index, 1)
                                        "
                                    >
                                        <ArrowDown aria-hidden="true" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        :disabled="form.processing"
                                        :aria-label="`Quitar ${field.label}`"
                                        @click="
                                            form.header_fields.splice(index, 1)
                                        "
                                    >
                                        <Trash2 aria-hidden="true" />
                                    </Button>
                                </div>
                                <FieldError
                                    v-if="
                                        errorFor(`header_fields.${index}.label`)
                                    "
                                    :errors="[
                                        errorFor(
                                            `header_fields.${index}.label`,
                                        ),
                                    ]"
                                />
                            </Field>
                        </FieldGroup>

                        <FieldGroup>
                            <div
                                class="flex items-center justify-between gap-3"
                            >
                                <div>
                                    <p class="font-medium">
                                        Columnas de cada fila
                                    </p>
                                    <p class="text-sm text-muted-foreground">
                                        Cada columna se verá como $clave dentro
                                        del molde.
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    :disabled="
                                        form.processing ||
                                        form.columns.length >= 24
                                    "
                                    @click="addColumn"
                                >
                                    <Plus
                                        data-icon="inline-start"
                                        aria-hidden="true"
                                    />
                                    Agregar columna
                                </Button>
                            </div>

                            <FieldGroup
                                v-for="(column, index) in form.columns"
                                :key="column.key"
                                class="gap-4 rounded-lg border p-4"
                            >
                                <div
                                    class="flex items-center justify-between gap-3"
                                >
                                    <p class="font-medium">
                                        Columna {{ index + 1 }}
                                        <span
                                            class="font-mono text-sm text-muted-foreground"
                                        >
                                            ${{ column.key }}
                                        </span>
                                    </p>
                                    <div class="flex gap-1">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            :disabled="
                                                form.processing || index === 0
                                            "
                                            :aria-label="`Subir ${column.label}`"
                                            @click="
                                                move(form.columns, index, -1)
                                            "
                                        >
                                            <ArrowUp aria-hidden="true" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            :disabled="
                                                form.processing ||
                                                index ===
                                                    form.columns.length - 1
                                            "
                                            :aria-label="`Bajar ${column.label}`"
                                            @click="
                                                move(form.columns, index, 1)
                                            "
                                        >
                                            <ArrowDown aria-hidden="true" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            :disabled="
                                                form.processing ||
                                                form.columns.length === 1
                                            "
                                            :aria-label="`Quitar ${column.label}`"
                                            @click="removeColumn(index)"
                                        >
                                            <Trash2 aria-hidden="true" />
                                        </Button>
                                    </div>
                                </div>

                                <div class="grid gap-4 md:grid-cols-3">
                                    <Field
                                        :data-invalid="
                                            Boolean(
                                                errorFor(
                                                    `columns.${index}.label`,
                                                ),
                                            )
                                        "
                                    >
                                        <FieldLabel
                                            :for="`table-column-label-${index}`"
                                            required
                                        >
                                            Nombre visible
                                        </FieldLabel>
                                        <Input
                                            :id="`table-column-label-${index}`"
                                            v-model="column.label"
                                            maxlength="180"
                                            :disabled="form.processing"
                                            :aria-invalid="
                                                Boolean(
                                                    errorFor(
                                                        `columns.${index}.label`,
                                                    ),
                                                )
                                            "
                                        />
                                        <FieldError
                                            v-if="
                                                errorFor(
                                                    `columns.${index}.label`,
                                                )
                                            "
                                            :errors="[
                                                errorFor(
                                                    `columns.${index}.label`,
                                                ),
                                            ]"
                                        />
                                    </Field>

                                    <Field>
                                        <FieldLabel
                                            :for="`table-column-type-${index}`"
                                        >
                                            Tipo de dato
                                        </FieldLabel>
                                        <Select
                                            :model-value="column.type"
                                            :disabled="form.processing"
                                            @update:model-value="
                                                setColumnType(column, $event)
                                            "
                                        >
                                            <SelectTrigger
                                                :id="`table-column-type-${index}`"
                                                class="w-full"
                                            >
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent portal-disabled>
                                                <SelectGroup>
                                                    <SelectItem value="text"
                                                        >Texto</SelectItem
                                                    >
                                                    <SelectItem value="number"
                                                        >Número</SelectItem
                                                    >
                                                </SelectGroup>
                                            </SelectContent>
                                        </Select>
                                    </Field>

                                    <Field>
                                        <FieldLabel
                                            :for="`table-column-role-${index}`"
                                        >
                                            Uso especial
                                        </FieldLabel>
                                        <Select
                                            :model-value="column.role ?? 'none'"
                                            :disabled="form.processing"
                                            @update:model-value="
                                                setColumnRole(column, $event)
                                            "
                                        >
                                            <SelectTrigger
                                                :id="`table-column-role-${index}`"
                                                class="w-full"
                                            >
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent portal-disabled>
                                                <SelectGroup>
                                                    <SelectItem value="none"
                                                        >Ninguno</SelectItem
                                                    >
                                                    <SelectItem
                                                        v-for="option in roleOptions"
                                                        :key="option.value"
                                                        :value="option.value"
                                                    >
                                                        {{ option.label }}
                                                    </SelectItem>
                                                </SelectGroup>
                                            </SelectContent>
                                        </Select>
                                        <FieldDescription>
                                            Activa validaciones de
                                            planificación.
                                        </FieldDescription>
                                    </Field>
                                </div>

                                <Field
                                    v-if="
                                        column.type === 'number' &&
                                        column.role !== 'week'
                                    "
                                    orientation="horizontal"
                                >
                                    <Checkbox
                                        :id="`table-column-sum-${index}`"
                                        :model-value="Boolean(column.sum)"
                                        :disabled="form.processing"
                                        @update:model-value="
                                            column.sum = $event === true
                                        "
                                    />
                                    <FieldLabel
                                        :for="`table-column-sum-${index}`"
                                    >
                                        Incluir esta columna en los totales
                                    </FieldLabel>
                                </Field>
                            </FieldGroup>
                        </FieldGroup>

                        <FieldGroup class="rounded-lg border p-4">
                            <Field orientation="horizontal">
                                <Checkbox
                                    id="table-totals-enabled"
                                    :model-value="form.totals.enabled"
                                    :disabled="form.processing"
                                    @update:model-value="
                                        form.totals.enabled = $event === true
                                    "
                                />
                                <FieldLabel for="table-totals-enabled">
                                    <FieldTitle
                                        >Mostrar fila de totales</FieldTitle
                                    >
                                    <FieldDescription>
                                        Suma automáticamente las columnas
                                        numéricas seleccionadas.
                                    </FieldDescription>
                                </FieldLabel>
                            </Field>
                            <Field
                                v-if="form.totals.enabled"
                                :data-invalid="
                                    Boolean(errorFor('totals.label'))
                                "
                            >
                                <FieldLabel for="table-totals-label" required>
                                    Texto de la fila
                                </FieldLabel>
                                <Input
                                    id="table-totals-label"
                                    v-model="form.totals.label"
                                    maxlength="180"
                                    placeholder="Ej. Total, horas"
                                    :disabled="form.processing"
                                    :aria-invalid="
                                        Boolean(errorFor('totals.label'))
                                    "
                                />
                                <FieldError
                                    v-if="errorFor('totals.label')"
                                    :errors="[errorFor('totals.label')]"
                                />
                            </Field>
                        </FieldGroup>

                        <Alert v-if="error" variant="destructive">
                            <AlertTitle
                                >No se pudo guardar la estructura</AlertTitle
                            >
                            <AlertDescription>{{ error }}</AlertDescription>
                        </Alert>

                        <Alert v-if="purge" variant="destructive">
                            <AlertTitle>Confirmación necesaria</AlertTitle>
                            <AlertDescription class="flex flex-col gap-3">
                                <span>
                                    {{ purge }} Guardar y reiniciar elimina ese
                                    trabajo en curso.
                                </span>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    class="self-start"
                                    :disabled="form.processing"
                                    @click="submit(true)"
                                >
                                    Guardar y reiniciar
                                </Button>
                            </AlertDescription>
                        </Alert>
                    </FieldGroup>
                </div>

                <DialogFooter class="shrink-0 border-t bg-card px-6 py-4">
                    <Button
                        type="button"
                        variant="outline"
                        :disabled="form.processing"
                        @click="updateOpen(false)"
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="submit"
                        :disabled="form.processing || !canSubmit"
                    >
                        <Save data-icon="inline-start" aria-hidden="true" />
                        Guardar estructura
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    </Dialog>
</template>
