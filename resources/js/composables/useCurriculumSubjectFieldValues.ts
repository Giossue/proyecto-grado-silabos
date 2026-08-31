import type { MaybeRefOrGetter } from 'vue';
import { computed, ref, toValue, watch } from 'vue';
import type {
    CurriculumBuilderSubject,
    CurriculumFieldDefinition,
} from '@/types/academic';

const HOUR_COMPONENT_KEYS = new Set([
    'hours_project',
    'hours_ap',
    'hours_ac',
    'hours_pae',
    'hours_aa',
    'hours_paec',
]);

const fieldKey = (field: CurriculumFieldDefinition): string =>
    field.system_key ?? field.id;

const normalizedValue = (value: unknown): number | string => {
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }

    return typeof value === 'number' || typeof value === 'string' ? value : '';
};

const numericValue = (value: number | string): number => {
    if (value === '') {
        return 0;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
};

export function useCurriculumSubjectFieldValues(
    subject: MaybeRefOrGetter<CurriculumBuilderSubject | null>,
    definitions: MaybeRefOrGetter<CurriculumFieldDefinition[]>,
) {
    const values = ref<Record<string, number | string>>({});

    const reset = (): void => {
        const currentSubject = toValue(subject);

        values.value = Object.fromEntries(
            toValue(definitions).map((field) => {
                const value = field.system_key
                    ? currentSubject?.system_values[field.system_key]
                    : currentSubject?.custom_values[field.id];

                return [fieldKey(field), normalizedValue(value)];
            }),
        );
    };

    watch([() => toValue(subject), () => toValue(definitions)], reset, {
        deep: true,
        immediate: true,
    });

    const totalHours = computed(() =>
        toValue(definitions)
            .filter(
                (field) =>
                    field.system_key !== null &&
                    HOUR_COMPONENT_KEYS.has(field.system_key),
            )
            .reduce(
                (total, field) =>
                    total + numericValue(values.value[fieldKey(field)] ?? ''),
                0,
            ),
    );

    const valueFor = (field: CurriculumFieldDefinition): number | string =>
        field.system_key === 'total_hours'
            ? totalHours.value
            : (values.value[fieldKey(field)] ?? '');

    const updateValue = (
        field: CurriculumFieldDefinition,
        value: unknown,
    ): void => {
        if (field.system_key === 'total_hours') {
            return;
        }

        values.value[fieldKey(field)] = normalizedValue(value);
    };

    return {
        reset,
        totalHours,
        updateValue,
        valueFor,
    };
}
