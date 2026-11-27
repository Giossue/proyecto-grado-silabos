import { countOf, parseNumber, Scope } from './scope';
import type { BlockRule } from './types';

export type CheckResult = { label: string | null; actual: string; expected: string; ok: boolean };
export type SumBudget = { path: string; label: string; used: number; limit: number | null };

export const sumOf = (values: unknown[]): number => values.reduce<number>((sum, item) => sum + parseNumber(item), 0);

export const sumBudgets = (rules: BlockRule[], value: Record<string, unknown>, variables: Record<string, string>): SumBudget[] => {
    const scope = new Scope(value, {}, variables);
    return rules.filter((rule) => rule.on === 'submit').flatMap((rule) => rule.checks.flatMap((check) => {
        if (check.sum === undefined || typeof check.equals !== 'object' || !('variable' in check.equals)) return [];
        const limit = (variables[check.equals.variable] ?? '').trim();
        return [{ path: check.sum, label: check.label ?? '', used: sumOf(scope.collect(check.sum)), limit: limit === '' ? null : parseNumber(limit) }];
    }));
};

export const ruleResults = (rule: BlockRule, value: Record<string, unknown>, variables: Record<string, string>): CheckResult[] => {
    const scope = new Scope(value, {}, variables);
    return rule.checks.map((check) => {
        const actual = check.count !== undefined
            ? countOf(scope.collect(check.count))
            : check.filled !== undefined
                // «filled» cuenta textos o números escritos y listas con algo (una unidad con semanas), como el backend.
                ? scope.collect(check.filled).filter((item) => Array.isArray(item) ? item.length > 0 : (typeof item === 'string' || typeof item === 'number') && String(item).trim() !== '').length
                : sumOf(scope.collect(check.sum ?? ''));
        const comparison = check.equals !== undefined ? 'equals' : check.max !== undefined ? 'max' : 'min';
        const target = check[comparison];
        const expected = typeof target !== 'object' || target === null
            ? Number(target ?? 0)
            : 'count' in target ? countOf(scope.collect(target.count)) : parseNumber(variables[target.variable] ?? '');
        const unknown = typeof target === 'object' && target !== null && 'variable' in target && (variables[target.variable] ?? '').trim() === '';
        const ok = unknown || (comparison === 'equals'
            ? Math.abs(actual - expected) <= 0.001
            : comparison === 'max' ? actual <= expected + 0.001 : actual >= expected - 0.001);
        return { label: check.label ?? null, actual: String(actual), expected: String(expected), ok };
    });
};

export const ruleFailures = (rules: BlockRule[], value: Record<string, unknown>, variables: Record<string, string>, on: 'save' | 'submit'): Array<{ code: string; message: string }> =>
    rules.filter((rule) => rule.on === on).flatMap((rule) => {
        const failed = ruleResults(rule, value, variables).filter((result) => !result.ok);
        if (failed.length === 0) return [];
        const first = failed[0]!;
        const detail = failed.map((result) => `${result.label ?? ''} ${result.actual} de ${result.expected}`.trim()).join(', ');
        return [{ code: rule.code, message: rule.message.replaceAll('{actual}', first.actual).replaceAll('{expected}', first.expected).replaceAll('{detail}', detail) }];
    });
