import type { Condition } from '@/lib/blocks/types';
import { parseNumber, type Scope } from '@/lib/blocks/scope';

const isEmpty = (value: unknown): boolean =>
    value === null || value === undefined || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && value.length === 0);

export const holds = (condition: Condition, scope: Scope): boolean => {
    if ('not' in condition) return !holds(condition.not, scope);
    const value = condition.value !== undefined
        ? scope.value(condition.value)
        : condition.prop !== undefined
            ? scope.prop(condition.prop)
            : condition.item !== undefined
                ? scope.aliased(condition.item)
                : scope.variable(condition.variable ?? '');
    if ('equals' in condition) {
        if (condition.equals === null) return value === null || value === undefined;
        return (typeof value === 'string' || typeof value === 'number') && String(value) === String(condition.equals);
    }
    if ('empty' in condition) return isEmpty(value) === condition.empty;
    const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
    const zero = text !== '' && parseNumber(text) === 0;
    return zero === condition.zero;
};
