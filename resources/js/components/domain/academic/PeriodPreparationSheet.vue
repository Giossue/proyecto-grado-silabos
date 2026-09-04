<script setup lang="ts">
import { useForm } from '@inertiajs/vue3';
import { CalendarCheck, CheckCheck, ListChecks, Plus, Trash2 } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import CareerAcademicStructureController from '@/actions/App/Modules/Academic/Presentation/Http/Controllers/CareerAcademicStructureController';
import FormSheet from '@/components/domain/FormSheet.vue';
import FormSheetActions from '@/components/domain/FormSheetActions.vue';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
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
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { PARALLEL_SHIFTS as SHIFTS } from '@/lib/parallelShifts';
import type { AcademicStructureProps, Option } from '@/types/academic';

type ParallelDraft = {
    code: string;
    shift: string;
};

type PreparationRow = {
    id: string;
    code: string;
    name: string;
    selected: boolean;
    parallels: ParallelDraft[];
};

const props = defineProps<Pick<AcademicStructureProps, 'offerings' | 'options'>>();
const open = ref(false);
const rows = ref<PreparationRow[]>([]);
const bulkCode = ref('A');
const bulkShift = ref('');
const prepare = useForm<{
    period_id: string;
    subjects: {
        id: string;
        parallels: { code: string; shift: string | null }[];
    }[];
}>({
    period_id: '',
    subjects: [],
});

const dateFormatter = new Intl.DateTimeFormat('es-EC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
});
const dateRange = (period: Option): string =>
    period.starts_on && period.ends_on
        ? [
              dateFormatter.format(new Date(period.starts_on + 'T00:00:00Z')),
              dateFormatter.format(new Date(period.ends_on + 'T00:00:00Z')),
          ].join(' – ')
        : period.nombre ?? '';
const preparedSubjectIds = computed(
    () =>
        new Set(
            props.offerings
                .filter((offering) => offering.period_id === prepare.period_id)
                .map((offering) => offering.subject_id),
        ),
);
const availableRows = computed(() =>
    prepare.period_id === ''
        ? []
        : rows.value.filter((row) => !preparedSubjectIds.value.has(row.id)),
);
const selectedRows = computed(() =>
    availableRows.value.filter((row) => row.selected),
);
const invalidRows = computed(() =>
    selectedRows.value.filter(
        (row) =>
            row.parallels.length === 0 ||
            row.parallels.some((parallel) => parallel.code.trim() === ''),
    ),
);
const formError = computed(
    () =>
        prepare.errors.period_id ??
        prepare.errors.subjects ??
        Object.values(prepare.errors).find(Boolean),
);

const reset = (): void => {
    rows.value = props.options.activeSubjects.map((subject) => ({
        id: subject.id,
        code: subject.codigo_institucional ?? subject.code ?? 'Sin código',
        name: subject.nombre ?? subject.name ?? 'Materia sin nombre',
        selected: false,
        parallels: [{ code: 'A', shift: '' }],
    }));
    bulkCode.value = 'A';
    bulkShift.value = '';
    prepare.reset();
    prepare.clearErrors();
};

const applyToSelected = (): void => {
    const code = bulkCode.value.trim();

    if (code === '') {
        return;
    }

    for (const row of selectedRows.value) {
        row.parallels[0] = { code, shift: bulkShift.value };
    }
};
const addParallel = (row: PreparationRow): void => {
    row.parallels.push({ code: '', shift: '' });
};
const removeParallel = (row: PreparationRow, index: number): void => {
    if (row.parallels.length > 1) {
        row.parallels.splice(index, 1);
    }
};
const selectAll = (selected: boolean): void => {
    for (const row of availableRows.value) {
        row.selected = selected;
    }
};
const submit = (close: () => void): void => {
    if (selectedRows.value.length === 0 || invalidRows.value.length > 0) {
        return;
    }

    prepare
        .transform(() => ({
            period_id: prepare.period_id,
            subjects: selectedRows.value.map((row) => ({
                id: row.id,
                parallels: row.parallels.map((parallel) => ({
                    code: parallel.code.trim(),
                    shift: parallel.shift || null,
                })),
            })),
        }))
        .post(CareerAcademicStructureController.preparePeriod.url(), {
            preserveScroll: true,
            onSuccess: () => {
                close();
                reset();
            },
        });
};

watch(open, (isOpen) => {
    if (isOpen) {
        reset();
    }
});
</script>

<template>
    <FormSheet
        v-model:open="open"
        wide
        trigger-label="Preparar período"
        title="Preparar período académico"
        description="Seleccione materias aún no preparadas y configure sus paralelos. Campus y modalidad se heredan de la carrera."
    >
        <template #trigger>
            <Button>
                <CalendarCheck data-icon="inline-start" aria-hidden="true" />
                Preparar período
            </Button>
        </template>

        <template #default="{ close }">
            <form class="contents" @submit.prevent="submit(close)">
                <FieldGroup>
                    <Field :data-invalid="Boolean(prepare.errors.period_id)">
                        <FieldLabel for="period-preparation-period" required>
                            Período académico
                        </FieldLabel>
                        <Select v-model="prepare.period_id" required>
                            <SelectTrigger
                                id="period-preparation-period"
                                :aria-invalid="Boolean(prepare.errors.period_id)"
                            >
                                <SelectValue
                                    placeholder="Seleccione un período"
                                />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem
                                        v-for="period in options.periods"
                                        :key="period.id"
                                        :value="period.id"
                                    >
                                        {{ dateRange(period) }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </Field>

                    <Alert v-if="formError" variant="destructive">
                        <AlertDescription>{{ formError }}</AlertDescription>
                    </Alert>

                    <Alert v-if="prepare.period_id === ''">
                        <AlertDescription>
                            Seleccione un período para ver las materias que aún no
                            tienen oferta.
                        </AlertDescription>
                    </Alert>

                    <Alert v-else-if="availableRows.length === 0">
                        <AlertDescription>
                            Todas las materias activas ya tienen una oferta en este
                            período. Agregue paralelos desde las acciones de cada
                            oferta.
                        </AlertDescription>
                    </Alert>

                    <template v-else>
                    <div
                        class="flex w-full max-w-5xl flex-col gap-3 rounded-lg border bg-muted/30 p-4 lg:flex-row lg:items-end"
                    >
                        <Field class="min-w-0 flex-1">
                            <FieldLabel for="period-preparation-code">
                                Paralelo inicial para las seleccionadas
                            </FieldLabel>
                            <Input
                                id="period-preparation-code"
                                v-model="bulkCode"
                                placeholder="Ej. A"
                            />
                        </Field>
                        <Field class="min-w-0 flex-1">
                            <FieldLabel for="period-preparation-shift">
                                Jornada inicial para las seleccionadas
                            </FieldLabel>
                            <Select v-model="bulkShift">
                                <SelectTrigger id="period-preparation-shift">
                                    <SelectValue
                                        placeholder="Sin jornada definida"
                                    />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem
                                            v-for="shift in SHIFTS"
                                            :key="shift.value"
                                            :value="shift.value"
                                        >
                                            {{ shift.label }}
                                        </SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </Field>
                        <Button
                            type="button"
                            variant="outline"
                            :disabled="selectedRows.length === 0"
                            @click="applyToSelected"
                        >
                            <CheckCheck
                                data-icon="inline-start"
                                aria-hidden="true"
                            />
                            Aplicar a seleccionadas
                        </Button>
                    </div>

                    <div class="flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            @click="selectAll(true)"
                        >
                            Seleccionar todas
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            @click="selectAll(false)"
                        >
                            Ninguna
                        </Button>
                        <p class="text-sm text-muted-foreground">
                            {{ selectedRows.length }} de {{ availableRows.length }}
                            materias seleccionadas.
                        </p>
                    </div>

                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead class="w-12">
                                    <span class="sr-only">Incluir</span>
                                </TableHead>
                                <TableHead>Código</TableHead>
                                <TableHead>Materia</TableHead>
                                <TableHead>Paralelos y jornada</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow v-for="row in availableRows" :key="row.id">
                                <TableCell>
                                    <Checkbox
                                        :model-value="row.selected"
                                        :aria-label="'Incluir ' + row.name"
                                        @update:model-value="row.selected = $event === true"
                                    />
                                </TableCell>
                                <TableCell>{{ row.code }}</TableCell>
                                <TableCell>{{ row.name }}</TableCell>
                                <TableCell>
                                    <div class="flex flex-col gap-2">
                                        <div
                                            v-for="(parallel, index) in row.parallels"
                                            :key="index"
                                            class="flex flex-wrap items-center gap-2"
                                        >
                                            <Input
                                                v-model="parallel.code"
                                                class="w-28"
                                                :disabled="!row.selected"
                                                :aria-label="`Código del paralelo ${index + 1} de ${row.name}`"
                                                :placeholder="index === 0 ? 'Ej. A' : 'Ej. B'"
                                            />
                                            <Select
                                                v-model="parallel.shift"
                                                :disabled="!row.selected"
                                            >
                                                <SelectTrigger
                                                    class="w-44"
                                                    :aria-label="`Jornada del paralelo ${index + 1} de ${row.name}`"
                                                >
                                                    <SelectValue
                                                        placeholder="Sin jornada"
                                                    />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectGroup>
                                                        <SelectItem
                                                            v-for="shift in SHIFTS"
                                                            :key="shift.value"
                                                            :value="shift.value"
                                                        >
                                                            {{ shift.label }}
                                                        </SelectItem>
                                                    </SelectGroup>
                                                </SelectContent>
                                            </Select>
                                            <Button
                                                v-if="row.parallels.length > 1"
                                                type="button"
                                                size="icon-sm"
                                                variant="ghost"
                                                :disabled="!row.selected"
                                                :aria-label="`Quitar paralelo ${parallel.code || index + 1} de ${row.name}`"
                                                @click="removeParallel(row, index)"
                                            >
                                                <Trash2 aria-hidden="true" />
                                            </Button>
                                        </div>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            class="w-fit"
                                            :disabled="!row.selected"
                                            @click="addParallel(row)"
                                        >
                                            <Plus
                                                data-icon="inline-start"
                                                aria-hidden="true"
                                            />
                                            Agregar paralelo
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>

                    <Alert
                        v-if="invalidRows.length > 0"
                        variant="destructive"
                    >
                        <AlertDescription>
                            Cada materia seleccionada debe tener al menos un paralelo
                            con código.
                        </AlertDescription>
                    </Alert>
                    </template>

                    <FormSheetActions
                        :close="close"
                        :processing="prepare.processing"
                        :disabled="
                            prepare.period_id === '' ||
                            selectedRows.length === 0 ||
                            invalidRows.length > 0
                        "
                        :icon="ListChecks"
                        label="Aplicar preparación"
                    />
                </FieldGroup>
            </form>
        </template>
    </FormSheet>
</template>
