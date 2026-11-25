import type { DocumentNode } from '../templateDocument';
import { holds } from './condition';
import { countOf, formatTotal, parseNumber, Scope, segments, type Path } from './scope';
import { isChoice, optionTitle, type BlockDefinition, type Condition, type ListSchema, type ObjectSchema, type ValueSchema } from './types';

export type SlotMeta = { path: Path; schema: ValueSchema | null; option?: string; mark?: string; text: string; scope: Scope };
export type RowMeta = { listPath: Path; index: number; schema: ListSchema; placeholder?: boolean };
export type ResolvedNode = DocumentNode & { slot?: SlotMeta; row?: RowMeta; content?: ResolvedNode[] };

type Repeat = { value?: string; as?: string; at_least?: number };
type Attrs = Record<string, unknown> & { repeat?: Repeat; when?: Condition; band?: string };
const DIRECTIVES = ['repeat', 'when', 'band'];

export const schemaAt = (schema: ValueSchema | ObjectSchema | null, path: string): ValueSchema | null => {
    let current: ValueSchema | null = schema;
    for (const segment of segments(path)) {
        if (current === null) return null;
        if (segment === '*') {
            current = current.type === 'array' ? current.items : null;
            continue;
        }
        current = current.type === 'object' ? current.properties[segment] ?? null : null;
    }
    return current;
};

const slotText = (attrs: Record<string, unknown>, scope: Scope, schema: ValueSchema | null): string => {
    if (typeof attrs.value === 'string') {
        const value = scope.value(attrs.value);
        if (typeof attrs.option === 'string') return value === attrs.option ? (typeof attrs.mark === 'string' ? attrs.mark : 'X') : '';
        const target = schemaAt(schema, attrs.value);
        if (isChoice(target)) return optionTitle(target, value);
        return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
    }
    if (typeof attrs.prop === 'string') {
        const value = scope.prop(attrs.prop);
        return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
    }
    if (typeof attrs.item === 'string') {
        const value = scope.aliased(attrs.item);
        return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
    }
    if (typeof attrs.counter === 'string') return String(scope.counters.next(`counter:${attrs.counter}`));
    if (typeof attrs.sum === 'string') return formatTotal(scope.collect(attrs.sum).reduce<number>((sum, value) => sum + parseNumber(value), 0));
    if (typeof attrs.count === 'string') return String(countOf(scope.collect(attrs.count)));
    return scope.index === null ? '' : String(scope.index);
};

const node = (source: DocumentNode, scope: Scope, schema: ValueSchema | null, id: string, padding = false): ResolvedNode[] => {
    if (source.type === 'group') return nodes(source.content ?? [], scope, schema, id, padding);
    if (source.type === 'slot') {
        const attrs = (source.attrs ?? {}) as Record<string, unknown>;
        const text = slotText(attrs, scope, schema);
        if (typeof attrs.value === 'string' && !padding) {
            return [{
                type: 'slot',
                ...(source.marks ? { marks: source.marks } : {}),
                slot: { path: scope.absolute(attrs.value), schema: schemaAt(schema, attrs.value), option: typeof attrs.option === 'string' ? attrs.option : undefined, mark: typeof attrs.mark === 'string' ? attrs.mark : undefined, text, scope },
            }];
        }
        return text === '' ? [] : [{ type: 'text', text, ...(source.marks ? { marks: source.marks } : {}) }];
    }
    const attrs = (source.attrs ?? {}) as Attrs;
    const band = typeof attrs.band === 'string' ? attrs.band : null;
    const cleaned = Object.fromEntries(Object.entries(attrs).filter(([key]) => !DIRECTIVES.includes(key)));
    const out: ResolvedNode = { ...source, ...(Object.keys(cleaned).length > 0 ? { attrs: cleaned as DocumentNode['attrs'] } : {}) };
    if (Object.keys(cleaned).length === 0) delete out.attrs;
    if (source.content) out.content = nodes(source.content, scope, schema, id, padding);
    if (band !== null && scope.counters.next(`band:${id}`) % 2 === 1) {
        out.content = (out.content ?? []).map((cell) => cell.attrs?.backgroundColor ? cell : { ...cell, attrs: { ...(cell.attrs ?? {}), backgroundColor: band } });
    }
    return [out];
};

const nodes = (sources: DocumentNode[], scope: Scope, schema: ValueSchema | null, path: string, padding = false): ResolvedNode[] => {
    const out: ResolvedNode[] = [];
    sources.forEach((source, position) => {
        const id = `${path}.${position}`;
        const attrs = (source.attrs ?? {}) as Attrs;
        if (attrs.when && !holds(attrs.when, scope)) return;
        const repeat = attrs.repeat;
        if (!repeat) {
            out.push(...node(source, scope, schema, id, padding));
            return;
        }
        const raw = repeat.value !== undefined ? scope.value(repeat.value) : [];
        const items: unknown[] = Array.isArray(raw) ? [...raw] : [];
        const real = items.length;
        while (items.length < (repeat.at_least ?? 0)) items.push({});
        const list = repeat.value !== undefined ? schemaAt(schema, repeat.value) : null;
        const itemSchema = list?.type === 'array' ? list.items : schema;
        const tracked = repeat.value !== undefined && list?.type === 'array' && source.type === 'tableRow' && !padding;
        if (tracked && items.length === 0) out.push({ type: 'tableRow', content: [], row: { listPath: scope.absolute(repeat.value!), index: -1, schema: list, placeholder: true } });
        items.forEach((item, index) => {
            const record = typeof item === 'object' && item !== null && !Array.isArray(item) ? item as Record<string, unknown> : {};
            let child = repeat.value !== undefined ? scope.child(record, [...scope.absolute(repeat.value), index], index + 1) : scope;
            if (repeat.as) child = child.alias(repeat.as, item, index + 1);
            const padded = padding || index >= real;
            const produced = node(source, child, itemSchema, id, padded);
            if (tracked) {
                for (const row of produced) row.row = { listPath: scope.absolute(repeat.value!), index: padded ? -1 : index, schema: list };
            }
            out.push(...produced);
        });
    });
    return out;
};

export const resolveBlock = (definition: BlockDefinition, props: Record<string, unknown>, value: Record<string, unknown>, variables: Record<string, string>): ResolvedNode[] =>
    nodes(definition.layout, new Scope(value, props, variables), { type: 'object', properties: definition.value } as ObjectSchema, 'b');

const plain = (resolved: ResolvedNode): DocumentNode[] => {
    if (resolved.row?.placeholder) return [];
    if (resolved.type === 'slot') {
        const text = resolved.slot?.text ?? '';
        return text === '' ? [] : [{ type: 'text', text, ...(resolved.marks ? { marks: resolved.marks } : {}) }];
    }
    const copy: ResolvedNode = { ...resolved };
    delete copy.slot;
    delete copy.row;
    return [{ ...copy, ...(resolved.content ? { content: resolved.content.flatMap(plain) } : {}) } as DocumentNode];
};

export const toDocument = (resolved: ResolvedNode[]): DocumentNode[] => resolved.flatMap(plain);

export const filledText = (resolved: ResolvedNode[]): string => {
    const parts: string[] = [];
    const visit = (item: ResolvedNode): void => {
        if (item.type === 'slot' && item.slot && item.slot.text.trim() !== '') parts.push(item.slot.text.trim());
        item.content?.forEach(visit);
    };
    resolved.forEach(visit);
    return parts.join(' ');
};

