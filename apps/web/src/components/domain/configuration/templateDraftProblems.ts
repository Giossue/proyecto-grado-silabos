import type { TemplateDraftProblem } from '@/api/template';

export type DraftProblem = TemplateDraftProblem & { target: 'field' | 'section' | 'general'; id?: string };
export type SentSection = { id: string; fields: string[] };

export const locateDraftProblems = (problems: TemplateDraftProblem[], sections: SentSection[]): DraftProblem[] => problems.map((problem) => {
    const match = /^sections\.(\d+)(?:\.fields\.(\d+))?/.exec(problem.path);
    const section = match ? sections[Number(match[1])] : undefined;
    if (!match || !section) return { ...problem, target: 'general' };
    const field = match[2] === undefined ? undefined : section.fields[Number(match[2])];
    if (match[2] !== undefined && field) return { ...problem, target: 'field', id: field };

    return { ...problem, target: 'section', id: section.id };
});

export const draftProblemsByTarget = (problems: DraftProblem[]) => {
    const grouped = { general: [] as DraftProblem[], sections: {} as Record<string, DraftProblem[]>, fields: {} as Record<string, DraftProblem[]> };
    for (const problem of problems) {
        if (problem.target === 'general' || !problem.id) grouped.general.push(problem);
        else (grouped[problem.target === 'field' ? 'fields' : 'sections'][problem.id] ??= []).push(problem);
    }

    return grouped;
};

export const problemCount = (count: number): string => (count === 1 ? '1 problema' : `${count} problemas`);
