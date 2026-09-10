<script setup lang="ts">
import { router } from '@inertiajs/vue3';
import { computed, ref, watch } from 'vue';
import CareerAcademicActions from '@/components/domain/academic/CareerAcademicActions.vue';
import ClientFilterBar from '@/components/domain/ClientFilterBar.vue';
import TablePagination from '@/components/domain/TablePagination.vue';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
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
    TableEmpty,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { useClientFilter } from '@/composables/useClientFilter';
import { useClientPagination } from '@/composables/useClientPagination';
import { shiftLabel } from '@/lib/parallelShifts';
import { index as scheduledSubjectsIndex } from '@/routes/coordination/academic/scheduled-subjects';
import type { AcademicStructureProps, Option } from '@/types/academic';

const props = defineProps<
    Pick<
        AcademicStructureProps,
        'scheduledSubjects' | 'options' | 'selectedPeriodId'
    > & {
        lockReason?: string | null;
    }
>();
const selectedPeriod = ref(props.selectedPeriodId ?? '');
const dateFormatter = new Intl.DateTimeFormat('es-EC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
});
const formatPeriod = (startsOn?: string, endsOn?: string): string =>
    startsOn && endsOn
        ? [
              dateFormatter.format(new Date(startsOn + 'T00:00:00Z')),
              dateFormatter.format(new Date(endsOn + 'T00:00:00Z')),
          ].join(' – ')
        : '';
const periodLabel = (period: Option): string => {
    const dates = formatPeriod(period.starts_on, period.ends_on);
    const name = period.nombre ?? period.name;

    return [name, dates].filter(Boolean).join(' · ');
};
const selectedPeriodOption = computed(() =>
    props.options.periods.find((period) => period.id === selectedPeriod.value),
);
const periodRows = computed(() =>
    props.scheduledSubjects.filter(
        (item) => item.period_id === selectedPeriod.value,
    ),
);
const scheduledSubjectFilter = useClientFilter(
    periodRows,
    (item) => [
        item.subject_name,
        item.subject_code,
        item.subject_cycle?.toString(),
        ...item.parallels.flatMap((parallel) => [
            parallel.code,
            shiftLabel(parallel.shift),
        ]),
    ],
    {
        estado: {
            matches: (item, value) => item.active === (value === 'active'),
        },
    },
);
const emptyMessage = computed(() =>
    scheduledSubjectFilter.active.value
        ? 'No hay materias que coincidan con los filtros.'
        : 'No hay materias programadas para este período.',
);
const periodLockedLabel = computed(() =>
    selectedPeriodOption.value?.planning_enabled === false
        ? selectedPeriodOption.value.status === 'finalizado'
            ? 'El período finalizó. Su programación se conserva únicamente para consulta.'
            : 'El período está inactivo. Su programación se conserva únicamente para consulta.'
        : null,
);

const {
    items: scheduledSubjectPage,
    meta: scheduledSubjectMeta,
    setPage: setScheduledSubjectPage,
} = useClientPagination(() => scheduledSubjectFilter.items.value);

const changePeriod = (value: unknown): void => {
    if (typeof value !== 'string' || value === selectedPeriod.value) {
        return;
    }

    selectedPeriod.value = value;
    scheduledSubjectFilter.clear();
    setScheduledSubjectPage(1);
    router.get(
        scheduledSubjectsIndex.url(),
        { period: value },
        { preserveState: true, preserveScroll: true, replace: true },
    );
};

watch(
    () => props.selectedPeriodId,
    (value) => {
        selectedPeriod.value = value ?? '';
    },
);
</script>

<template>
    <Card>
        <CardContent class="flex flex-col gap-4">
            <ClientFilterBar
                :filter="scheduledSubjectFilter"
                input-id="scheduled-subjects-search"
                label="Buscar materia programada"
                placeholder="Buscar por materia, código, ciclo, paralelo o jornada"
            >
                <template #filters>
                    <Field data-wide>
                        <FieldLabel
                            for="scheduled-subject-period"
                            class="sr-only"
                        >
                            Período académico
                        </FieldLabel>
                        <Select
                            :model-value="selectedPeriod"
                            @update:model-value="changePeriod"
                        >
                            <SelectTrigger id="scheduled-subject-period">
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
                                        {{ periodLabel(period) }} ·
                                        {{ period.status_label }}
                                    </SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </Field>
                </template>
            </ClientFilterBar>

            <Alert v-if="periodLockedLabel">
                <AlertDescription>{{ periodLockedLabel }}</AlertDescription>
            </Alert>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Materia</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead>Ciclo</TableHead>
                        <TableHead>Paralelos y jornadas</TableHead>
                        <TableHead class="text-right">Acciones</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <TableEmpty
                        v-if="scheduledSubjectPage.length === 0"
                        :colspan="5"
                    >
                        {{ emptyMessage }}
                    </TableEmpty>
                    <TableRow
                        v-for="item in scheduledSubjectPage"
                        v-else
                        :key="item.id"
                    >
                        <TableCell>{{ item.subject_name }}</TableCell>
                        <TableCell>{{ item.subject_code }}</TableCell>
                        <TableCell>
                            {{
                                item.subject_cycle === null
                                    ? 'Sin ciclo'
                                    : `${item.subject_cycle}.º`
                            }}
                        </TableCell>
                        <TableCell>
                            <div class="flex flex-wrap gap-1.5">
                                <Badge
                                    v-for="parallel in item.parallels"
                                    :key="parallel.id"
                                    variant="outline"
                                >
                                    {{ parallel.code }} ·
                                    {{ shiftLabel(parallel.shift) }}
                                </Badge>
                                <span
                                    v-if="item.parallels.length === 0"
                                    class="text-muted-foreground"
                                >
                                    Sin paralelos
                                </span>
                            </div>
                        </TableCell>
                        <TableCell class="text-right">
                            <CareerAcademicActions
                                entity="programacion_asignatura"
                                :record="item"
                                :record-label="item.label"
                                :editable="item.editable"
                                :edit-supported="false"
                                :active="item.active"
                                :delete-supported="
                                    !lockReason && item.period_planning_enabled
                                "
                                :parallel-creation-supported="
                                    !lockReason &&
                                    item.active &&
                                    item.period_planning_enabled
                                "
                                :locked-label="
                                    !item.period_planning_enabled
                                        ? item.period_status === 'finalizado'
                                            ? 'Período finalizado: disponible solo para consulta'
                                            : 'Período inactivo: disponible solo para consulta'
                                        : (lockReason ?? undefined)
                                "
                                :options="options"
                            />
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>
            <TablePagination
                :meta="scheduledSubjectMeta"
                mode="client"
                label="Paginación de materias programadas"
                @update:page="setScheduledSubjectPage"
            />
        </CardContent>
    </Card>
</template>
