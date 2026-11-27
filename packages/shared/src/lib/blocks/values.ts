import { holds } from './condition';
import { Scope, type Path } from './scope';
import { isChoice, type ListSchema, type ValueSchema } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export const ROW_ID = '_id';

const newRowId = (): string => `w${Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;

export const emptyRow = (schema: ListSchema, props: Record<string, unknown>): unknown => {
    const row = emptyValue(schema.items, props);
    return schema.row_ids && isRecord(row) ? { [ROW_ID]: newRowId(), ...row } : row;
};

export const isBlankRow = (row: unknown): boolean =>
    isRecord(row) && Object.entries(row).every(([key, cell]) => key === ROW_ID || String(cell ?? '').trim() === '');

export const emptyValue = (schema: ValueSchema, props: Record<string, unknown>): unknown => {
    switch (schema.type) {
        case 'string':
            return isChoice(schema) ? null : '';
        case 'number':
            return '';
        case 'object':
            return Object.fromEntries(Object.entries(schema.properties).map(([key, field]) => [key, emptyValue(field, props)]));
        case 'array':
            return Array.from({ length: schema.minItems }, () => emptyRow(schema, props));
    }
};

const keep = (schema: ValueSchema, value: unknown, props: Record<string, unknown>): unknown => {
    if (schema.type === 'object') {
        const record = isRecord(value) ? { ...value } : {};
        for (const [key, field] of Object.entries(schema.properties)) record[key] = keep(field, record[key], props);
        for (const [key, field] of Object.entries(schema.properties)) {
            if (field.keep_if && !holds(field.keep_if, new Scope(record, props, {}))) record[key] = emptyValue(field, props);
        }
        return record;
    }
    if (schema.type === 'array') {
        const items = Array.isArray(value) ? value.map((item) => keep(schema.items, item, props)) : [];
        while (items.length < schema.minItems) items.push(emptyRow(schema, props));
        return items;
    }
    return value;
};

export const settle = (fields: Record<string, ValueSchema>, value: Record<string, unknown>, props: Record<string, unknown>): Record<string, unknown> =>
    keep({ type: 'object', properties: fields }, value, props) as Record<string, unknown>;

export const setAt = (value: unknown, path: Path, next: unknown): unknown => {
    if (path.length === 0) return next;
    const [head, ...rest] = path;
    if (Array.isArray(value)) {
        const copy = [...value];
        copy[Number(head)] = setAt(copy[Number(head)], rest, next);
        return copy;
    }
    const record = isRecord(value) ? value : {};
    return { ...record, [String(head)]: setAt(record[String(head)], rest, next) };
};

export const getAt = (value: unknown, path: Path): unknown => path.reduce<unknown>((current, segment) => {
    if (Array.isArray(current)) return current[Number(segment)];
    return isRecord(current) ? current[String(segment)] : undefined;
}, value);
