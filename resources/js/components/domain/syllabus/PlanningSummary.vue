<script setup lang="ts">
import { AlertCircle, CheckCircle2 } from '@lucide/vue';
import { computed } from 'vue';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { formatSum, summarizePlanning } from '@/lib/tableLayout';
import type {
    PlanningExpectations,
    TableLayout,
    TableRowData,
} from '@/lib/tableLayout';

const props = defineProps<{
    layout: TableLayout;
    rows: TableRowData[];
    expectations?: PlanningExpectations | null;
}>();

const summary = computed(() => summarizePlanning(props.layout, props.rows));
const comparisons = computed(() => {
    if (!summary.value || !props.expectations) {
        return [];
    }

    return [
        ['ACD', summary.value.totals.hours_acd, props.expectations.hours_acd],
        ['APE', summary.value.totals.hours_ape, props.expectations.hours_ape],
        ['AA', summary.value.totals.hours_aa, props.expectations.hours_aa],
    ].map(([label, actual, expected]) => ({
        label: String(label),
        actual: Number(actual),
        expected:
            expected === null || expected === '' ? null : Number(expected),
    }));
});
const weeksOk = computed(() => {
    const expected = props.expectations?.teaching_weeks;
    const weeks = summary.value?.weeks ?? [];

    return (
        expected != null &&
        new Set(weeks).size === expected &&
        weeks.every((week, index) => week === index + 1)
    );
});
const hoursOk = computed(
    () =>
        comparisons.value.length > 0 &&
        comparisons.value.every(
            ({ actual, expected }) => expected !== null && actual === expected,
        ),
);
const configuration = computed(() => {
    const expectations = props.expectations;

    if (!expectations) {
        return {
            ok: false,
            componentsOk: false,
            creditsOk: false,
            componentTotal: null,
            total: null,
            creditHours: null,
        };
    }

    const components = [
        expectations.hours_acd,
        expectations.hours_ape,
        expectations.hours_aa,
    ];

    if (
        components.some((value) => value === null || value === '') ||
        expectations.total_hours === null ||
        expectations.total_hours === '' ||
        expectations.credits === null ||
        expectations.credits === ''
    ) {
        return {
            ok: false,
            componentsOk: false,
            creditsOk: false,
            componentTotal: null,
            total: null,
            creditHours: null,
        };
    }

    const componentTotal = components
        .map(Number)
        .reduce((sum, value) => sum + value, 0);
    const total = Number(expectations.total_hours);
    const creditHours = Number(expectations.credits) * 48;

    return {
        ok: componentTotal === total && total === creditHours,
        componentsOk: componentTotal === total,
        creditsOk: total === creditHours,
        componentTotal,
        total,
        creditHours,
    };
});
const valid = computed(
    () => weeksOk.value && hoursOk.value && configuration.value.ok,
);
</script>

<template>
    <Alert
        v-if="summary && expectations"
        :variant="valid ? 'default' : 'destructive'"
    >
        <CheckCircle2 v-if="valid" aria-hidden="true" />
        <AlertCircle v-else aria-hidden="true" />
        <AlertTitle>Resumen automático de planificación</AlertTitle>
        <AlertDescription class="flex flex-col gap-2">
            <div class="flex flex-wrap gap-2">
                <Badge :variant="weeksOk ? 'secondary' : 'destructive'">
                    Semanas: {{ new Set(summary.weeks).size }} /
                    {{ expectations?.teaching_weeks ?? '—' }}
                </Badge>
                <Badge
                    v-for="item in comparisons"
                    :key="item.label"
                    :variant="
                        item.actual === item.expected
                            ? 'secondary'
                            : 'destructive'
                    "
                >
                    {{ item.label }}: {{ formatSum(item.actual) }} /
                    {{
                        item.expected === null ? '—' : formatSum(item.expected)
                    }}
                </Badge>
                <Badge variant="outline">
                    Créditos de malla: {{ expectations?.credits ?? '—' }}
                </Badge>
                <Badge
                    :variant="
                        configuration.componentsOk ? 'secondary' : 'destructive'
                    "
                >
                    Componentes / total de malla:
                    {{ configuration.componentTotal ?? '—' }} /
                    {{ configuration.total ?? '—' }}
                </Badge>
                <Badge
                    :variant="
                        configuration.creditsOk ? 'secondary' : 'destructive'
                    "
                >
                    Total malla / créditos × 48:
                    {{ configuration.total ?? '—' }} /
                    {{ configuration.creditHours ?? '—' }}
                </Badge>
            </div>
            <span v-if="!valid">
                Puede guardar el borrador, pero deberá completar las semanas y
                hacer coincidir las horas con la malla antes de enviarlo.
            </span>
        </AlertDescription>
    </Alert>
</template>
