import { RESPONSE_NODE, responseAttrs, responseHasOptions, type ResponseOption } from '@silabos/shared/lib/responseKinds';
import type { DocumentNode } from '@silabos/shared/lib/templateDocument';

export type ResponseCondition = { response: string; options: string[] };
export type ConditionField = { key: string; show_if?: ResponseCondition | null; document: DocumentNode | null | undefined };
export type ConditionResult = { hidden: Set<string>; answers: Record<string, unknown> };
export type ConditionSource = { id: string | null; label: string; options: ResponseOption[]; field: string; index: number };
export type ConditionChoice = { source: string; options: string[] };

export const conditionSourceKey = (source: ConditionSource): string => `${source.field}:${source.index}`;

export const choiceOf = (condition: ResponseCondition | null | undefined, sources: ConditionSource[]): ConditionChoice => {
    const source = condition ? sources.find((item) => item.id === condition.response) : undefined;
    return source && condition ? { source: conditionSourceKey(source), options: [...condition.options] } : { source: '', options: [] };
};

const RESPONSE_ID = /^[a-z][a-z0-9_]{0,40}$/;

export const conditionOf = (raw: unknown): ResponseCondition | null => {
    const value = raw as Partial<ResponseCondition> | null | undefined;
    return value && typeof value.response === 'string' && Array.isArray(value.options)
        ? { response: value.response, options: value.options.filter((option): option is string => typeof option === 'string') }
        : null;
};

export const responseIdOf = (node: DocumentNode): string | null => {
    const id = node.attrs?.id;
    return typeof id === 'string' && RESPONSE_ID.test(id) ? id : null;
};

export const responseNodes = (node: DocumentNode | null | undefined): DocumentNode[] =>
    !node ? [] : [...(node.type === RESPONSE_NODE ? [node] : []), ...(node.content ?? []).flatMap(responseNodes)];

export const conditionHolds = (condition: ResponseCondition, answers: Record<string, unknown>): boolean => {
    const value = answers[condition.response];
    const chosen = Array.isArray(value) ? value : [value];
    return chosen.some((option) => typeof option === 'string' && condition.options.includes(option));
};

export const conditionShows = (condition: ResponseCondition, answers: Record<string, unknown>): boolean =>
    !(condition.response in answers) || conditionHolds(condition, answers);

export const responseShown = (node: DocumentNode, answers: Record<string, unknown>): boolean => {
    const condition = conditionOf(node.attrs?.showIf);
    return !condition || conditionShows(condition, answers);
};

export const evaluateConditions = (fields: ConditionField[]): ConditionResult => {
    const hidden = new Set<string>();
    const answers: Record<string, unknown> = {};
    for (const field of fields) {
        const condition = conditionOf(field.show_if);
        const shown = !condition || conditionShows(condition, answers);
        if (!shown) hidden.add(field.key);
        for (const node of responseNodes(field.document)) {
            const id = responseIdOf(node);
            if (!id || id in answers) continue;
            answers[id] = shown && responseShown(node, answers) ? node.attrs?.value ?? null : null;
        }
    }
    return { hidden, answers };
};

export const withoutHiddenAnswers = (node: DocumentNode | null | undefined, answers: Record<string, unknown>): DocumentNode | null | undefined => {
    if (!node) return node;
    if (node.type === RESPONSE_NODE && !responseShown(node, answers)) {
        const attrs = responseAttrs(node);
        return { ...node, attrs: { ...node.attrs, value: (Array.isArray(attrs.value) ? [] : responseHasOptions(attrs.kind) ? null : '') as never } };
    }
    return node.content ? { ...node, content: node.content.map((child) => withoutHiddenAnswers(child, answers)!) } : node;
};

const LINES = new Set(['paragraph', 'heading', 'listItem']);
const CELLS = new Set(['tableCell', 'tableHeader']);
const LISTS = new Set(['bulletList', 'orderedList']);

export const onlyHiddenResponses = (node: DocumentNode | null | undefined, answers: Record<string, unknown>): boolean => {
    const responses = responseNodes(node);
    return responses.length > 0 && responses.every((response) => !responseShown(response, answers));
};

export const withoutHiddenLines = (node: DocumentNode | null | undefined, answers: Record<string, unknown>): DocumentNode | null | undefined => {
    if (!node?.content) return node;
    const content: DocumentNode[] = [];
    for (const child of node.content) {
        if (CELLS.has(child.type) && onlyHiddenResponses(child, answers)) {
            content.push({ ...child, content: [{ type: 'paragraph' }] });
            continue;
        }
        if (LINES.has(child.type) && onlyHiddenResponses(child, answers)) continue;
        const kept = withoutHiddenLines(child, answers)!;
        if (LISTS.has(child.type) && child.content?.length && !kept.content?.length) continue;
        content.push(kept);
    }
    return content.length === node.content.length && content.every((child, index) => child === node.content![index]) ? node : { ...node, content };
};

export const newResponseId = (used: Iterable<string>): string => {
    const taken = new Set(used);
    let id = '';
    do id = `r_${Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, '') || 'x'}`;
    while (taken.has(id));
    return id;
};

export const responseIds = (documents: Array<DocumentNode | null | undefined>): string[] =>
    documents.flatMap((document) => responseNodes(document).map(responseIdOf).filter((id): id is string => id !== null));

export const withResponseId = (document: DocumentNode, index: number, id: string): DocumentNode => {
    let position = -1;
    const visit = (node: DocumentNode): DocumentNode => {
        if (node.type === RESPONSE_NODE) {
            position += 1;
            return position === index ? { ...node, attrs: { ...node.attrs, id } } : node;
        }
        return node.content ? { ...node, content: node.content.map(visit) } : node;
    };
    return visit(document);
};

export const withNewResponseIds = (document: DocumentNode, used: Set<string>): DocumentNode => {
    const visit = (node: DocumentNode): DocumentNode => {
        if (node.type === RESPONSE_NODE && responseIdOf(node)) {
            const id = newResponseId(used);
            used.add(id);
            return { ...node, attrs: { ...node.attrs, id } };
        }
        return node.content ? { ...node, content: node.content.map(visit) } : node;
    };
    return visit(document);
};

const textOf = (node: DocumentNode): string => node.type === 'text' ? node.text ?? '' : (node.content ?? []).map(textOf).join('');

export const conditionSources = (fields: Array<{ id: string; label: string; content: DocumentNode }>): ConditionSource[] =>
    fields.flatMap((field) => {
        const sources: ConditionSource[] = [];
        let index = -1;
        const visit = (node: DocumentNode, lead: string): void => {
            if (node.type === RESPONSE_NODE) {
                index += 1;
                const attrs = responseAttrs(node);
                if (responseHasOptions(attrs.kind) && attrs.options.length > 0) {
                    const name = lead.trim().replace(/^[¿¡]+|[:¿?]+$/gu, '').trim() || field.label.trim() || 'Campo sin nombre';
                    sources.push({ id: responseIdOf(node), label: name, options: attrs.options, field: field.id, index });
                }
                return;
            }
            let text = '';
            for (const child of node.content ?? []) {
                if (child.type === RESPONSE_NODE) visit(child, text || lead);
                else {
                    visit(child, lead);
                    text += textOf(child);
                }
            }
        };
        visit(field.content, field.label);
        return sources;
    });

export const conditionLabel = (condition: ResponseCondition | null | undefined, sources: ConditionSource[]): string => {
    if (!condition) return '';
    const source = sources.find((item) => item.id === condition.response);
    if (!source) return 'Se muestra solo si se cumple una condición que ya no es válida';
    const titles = condition.options.map((key) => source.options.find((option) => option.const === key)?.title ?? key);
    return `Se muestra solo si «${source.label}» es ${titles.join(' o ')}`;
};

type ConditionedField = { key: string; show_if?: ResponseCondition | null; template?: DocumentNode | null; value: DocumentNode | null; document?: DocumentNode | null };

export const syllabusConditions = (sections: Array<{ fields: ConditionedField[] }>, documentOf: (field: ConditionedField) => DocumentNode | null | undefined): ConditionResult =>
    evaluateConditions(sections.flatMap((section) => section.fields.map((field) => ({ key: field.key, show_if: field.show_if, document: documentOf(field) }))));

export const visibleSections = <F extends ConditionedField, S extends { fields: F[] }>(sections: S[], result: ConditionResult): S[] =>
    sections.map((section) => ({
        ...section,
        fields: section.fields.filter((field) => !result.hidden.has(field.key)).map((field) => ({
            ...field,
            value: withoutHiddenLines(withoutHiddenAnswers(field.value, result.answers), result.answers) ?? null,
            document: withoutHiddenLines(withoutHiddenAnswers(field.document, result.answers), result.answers) ?? null,
        })),
    })).filter((section, index) => section.fields.length > 0 || sections[index]!.fields.length === 0);
