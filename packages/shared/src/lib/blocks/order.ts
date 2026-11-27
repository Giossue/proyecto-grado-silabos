import type { DocumentNode } from '../templateDocument';
import { segments } from './scope';
import type { BlockDefinition, ValueSchema } from './types';

type Seen = Map<string, number>;

const mark = (seen: Seen, path: string[]): void => {
    for (let end = 1; end <= path.length; end++) {
        const key = path.slice(0, end).join('.');
        if (!seen.has(key)) seen.set(key, seen.size);
    }
};

const walk = (nodes: DocumentNode[], prefix: string[], seen: Seen): void => {
    for (const node of nodes) {
        const attrs = (node.attrs ?? {}) as { value?: unknown; repeat?: { value?: string } };
        const list = attrs.repeat?.value === undefined ? null : [...prefix, ...segments(attrs.repeat.value)];
        if (list) mark(seen, list);
        const scope = list ? [...list, '*'] : prefix;
        if (node.type === 'slot' && typeof attrs.value === 'string') mark(seen, [...scope, ...segments(attrs.value)]);
        if (node.content) walk(node.content, scope, seen);
    }
};

const orderedProperties = (properties: Record<string, ValueSchema>, prefix: string[], seen: Seen): Record<string, ValueSchema> => {
    const position = (key: string): number => seen.get([...prefix, key].join('.')) ?? Number.MAX_SAFE_INTEGER;
    return Object.fromEntries(
        Object.entries(properties)
            .sort(([left], [right]) => position(left) - position(right))
            .map(([key, schema]) => [key, orderedSchema(schema, [...prefix, key], seen)]),
    );
};

const orderedSchema = (schema: ValueSchema, path: string[], seen: Seen): ValueSchema => {
    if (schema.type === 'object') return { ...schema, properties: orderedProperties(schema.properties, path, seen) };
    if (schema.type === 'array') return { ...schema, items: orderedSchema(schema.items, [...path, '*'], seen) };
    return schema;
};

export const valueInLayoutOrder = (definition: BlockDefinition): Record<string, ValueSchema> => {
    const seen: Seen = new Map();
    walk(definition.layout, [], seen);
    return orderedProperties(definition.value, [], seen);
};
