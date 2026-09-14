import type { MaybeRefOrGetter } from 'vue';
import { computed, ref, toValue, watch } from 'vue';
import type {
    CurriculumBuilderSubject,
    FixedSubjectField,
} from '@/types/academic';

const HOUR_COMPONENT_KEYS = new Set(['horas_ac', 'horas_pae', 'horas_aa']);

const fieldKey = (field: FixedSubjectField): string => field.system_key;

const normalizedValue = (value: unknown): number | string => {
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }

    if (typeof value !== 'number' && typeof value !== 'string') {
        return '';
    }

    return value;
};

// La base de datos entrega los decimales como cadena («20.00»); convertirlos a
// número descarta los ceros de relleno sin perder decimales reales («4.50» → 4.5).
// Solo aplica al cargar: normalizar mientras se teclea borraría el punto de «4.».
const storedValue = (
    field: FixedSubjectField,
    value: unknown,
): number | string => {
    const normalized = normalizedValue(value);

    if (
        (field.type === 'numero' || field.type === 'entero') &&
        typeof normalized === 'string' &&
        normalized !== ''
    ) {
        const parsed = Number(normalized);

        return Number.isFinite(parsed) ? parsed : normalized;
    }

    return normalized;
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
    definitions: MaybeRefOrGetter<FixedSubjectField[]>,
) {
    const values = ref<Record<string, number | string>>({});

    const reset = (): void => {
        const currentSubject = toValue(subject);

        values.value = Object.fromEntries(
            toValue(definitions).map((field) => {
                const value = currentSubject?.system_values[field.system_key];

                return [fieldKey(field), storedValue(field, value)];
            }),
        );
    };

    watch([() => toValue(subject), () => toValue(definitions)], reset, {
        deep: true,
        immediate: true,
    });

    const totalHours = computed(() =>
        toValue(definitions)
            .filter((field) => HOUR_COMPONENT_KEYS.has(field.system_key))
            .reduce(
                (total, field) =>
                    total + numericValue(values.value[fieldKey(field)] ?? ''),
                0,
            ),
    );

    const valueFor = (field: FixedSubjectField): number | string =>
        field.system_key === 'horas_totales'
            ? totalHours.value
            : (values.value[fieldKey(field)] ?? '');

    const updateValue = (field: FixedSubjectField, value: unknown): void => {
        if (field.system_key === 'horas_totales') {
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
