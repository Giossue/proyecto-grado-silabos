import { blankResponse, responseListTable } from '@/lib/fieldResponses';
import { responseShown } from '@/lib/responseConditions';
import { FREE_TEXT_KIND, RESPONSE_NODE, responseAnswered, responseAttrs } from '@silabos/shared/lib/responseKinds';
import type { DocumentNode } from '@silabos/shared/lib/templateDocument';

export const FIELD_LIMIT_MIN = 1;
export const FIELD_LIMIT_MAX = 50000;

export const characters = (text: string): number => [...text].length;

export const formatCharacters = (count: number): string => String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export const limitLabel = (limit: number): string => `Hasta ${formatCharacters(limit)} caracteres`;

export const counterLabel = (count: number, limit: number): string => `${formatCharacters(count)} / ${formatCharacters(limit)}`;

export const fitCharacters = (text: string, max: number, newlines = true): string => {
    let kept = 0;
    let result = '';
    for (const character of text) {
        const counted = newlines || character !== '\n';
        if (counted && kept >= max) break;
        if (counted) kept++;
        result += character;
    }
    return result;
};

export const textCharacters = (node: DocumentNode | null | undefined): number => {
    if (!node || node.type === 'documentBlock' || node.type === RESPONSE_NODE) return 0;
    if (node.type === 'text') return characters(node.text ?? '');
    return (node.content ?? []).reduce((sum, child) => sum + textCharacters(child), 0);
};

const written = (template: DocumentNode, value: DocumentNode, answers: Record<string, unknown>): number => {
    if (template.type === RESPONSE_NODE) {
        const attrs = responseAttrs(template);
        const answer = value.type === RESPONSE_NODE ? responseAttrs(value).value : null;
        return attrs.kind === FREE_TEXT_KIND && !responseAnswered(attrs) && responseShown(template, answers) && typeof answer === 'string' ? characters(answer) : 0;
    }
    if (template.type === 'documentBlock' || template.type === 'tableHeader' || template.type !== value.type) return 0;
    if (blankResponse(template)) return textCharacters(value);
    const rows = template.content ?? [];
    const list = template.type === 'table' && responseListTable(template);
    return (value.content ?? []).reduce((sum, child, index) => {
        const source = rows[index] ?? (list ? rows[rows.length - 1] : undefined);
        return sum + (source ? written(source, child, answers) : 0);
    }, 0);
};

export const fieldCharacters = (template: DocumentNode | null | undefined, value: DocumentNode | null | undefined, answers: Record<string, unknown> = {}): number =>
    value?.type === 'doc' ? written(template ?? { type: 'doc', content: [{ type: 'paragraph' }] }, value, answers) : 0;
