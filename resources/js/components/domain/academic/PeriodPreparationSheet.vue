<script setup lang="ts">
import { useForm } from '@inertiajs/vue3';
import { CalendarCheck, CheckCheck, ListChecks } from '@lucide/vue';
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

type PreparationRow = {
    id: string;
    code: string;
    name: string;
    selected: boolean;
    codes: string;
    shift: string;
};

const props = defineProps<Pick<AcademicStructureProps, 'options'>>();
const open = ref(false);
const rows = ref<PreparationRow[]>([]);
const bulkCodes = ref('A');
const bulkShift = ref('');
const prepare = useForm<{
    period_id: string;
    subjects: { id: string; codes: string[]; shift: string | null }[];
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
const codesFor = (value: string): string[] =>
    value
        .split(/[;,\n]/)
        .map((code) => code.trim())
        .filter(Boolean)
        .filter((code, index, all) => all.indexOf(code) === index);
const selectedRows = computed(() => rows.value.filter((row) => row.selected));
const invalidRows = computed(() =>
    selectedRows.value.filter((row) => codesFor(row.codes).length === 0),
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
        selected: true,
        codes: 'A',
        shift: '',
    }));
    bulkCodes.value = 'A';
    bulkShift.value = '';
    prepare.reset();
    prepare.clearErrors();
};

const applyToSelected = (): void => {
    const codes = codesFor(bulkCodes.value).join(', ');

    if (codes === '') {
        return;
    }

    for (const row of selectedRows.value) {
        row.codes = codes;
        row.shift = bulkShift.value;
    }
};
const selectAll = (selected: boolean): void => {
    for (const row of rows.value) {
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
                codes: codesFor(row.codes),
                shift: row.shift || null,
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
        full-screen
        trigger-label="Preparar período"
        title="Preparar período académico"
        description="Seleccione las materias que se dictarán y configure sus paralelos. Campus y modalidad se heredan de la carrera; las ofertas o paralelos existentes se conservan."
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

                    <div
                        class="flex w-full max-w-5xl flex-col gap-3 rounded-lg border bg-muted/30 p-4 lg:flex-row lg:items-end"
                    >
                        <Field class="min-w-0 flex-1">
                            <FieldLabel for="period-preparation-codes">
                                Paralelos para las seleccionadas
                            </FieldLabel>
                            <Input
                                id="period-preparation-codes"
                                v-model="bulkCodes"
                                placeholder="Ej. A, B, C"
                            />
                        </Field>
                        <Field class="min-w-0 flex-1">
                            <FieldLabel for="period-preparation-shift">
                                Jornada para las seleccionadas
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
                            {{ selectedRows.length }} de {{ rows.length }}
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
                                <TableHead>Paralelos</TableHead>
                                <TableHead>Jornada</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow v-for="row in rows" :key="row.id">
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
                                    <Input
                                        v-model="row.codes"
                                        :disabled="!row.selected"
                                        :aria-label="'Paralelos de ' + row.name"
                                        placeholder="A, B"
                                    />
                                </TableCell>
                                <TableCell>
                                    <Select
                                        v-model="row.shift"
                                        :disabled="!row.selected"
                                    >
                                        <SelectTrigger
                                            :aria-label="'Jornada de ' + row.name"
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
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>

                    <Alert
                        v-if="invalidRows.length > 0"
                        variant="destructive"
                    >
                        <AlertDescription>
                            Cada materia seleccionada debe tener al menos un
                            código de paralelo.
                        </AlertDescription>
                    </Alert>

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
