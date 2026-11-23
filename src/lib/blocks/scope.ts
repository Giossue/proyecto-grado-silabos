export type Path = Array<string | number>;

export class Counters {
    private values = new Map<string, number>();

    next(name: string): number {
        const value = (this.values.get(name) ?? 0) + 1;
        this.values.set(name, value);
        return value;
    }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export const segments = (path: string): string[] => path.match(/\{[^}]*\}|[^.]+/g) ?? [];

export const read = (data: unknown, path: string): unknown => {
    let value: unknown = data;
    for (const segment of segments(path)) {
        if (Array.isArray(value) && /^\d+$/.test(segment)) value = value[Number(segment)];
        else if (isRecord(value) && segment in value) value = value[segment];
        else return undefined;
    }
    return value;
};

export class Scope {
    constructor(
        readonly item: Record<string, unknown>,
        readonly props: Record<string, unknown>,
        readonly variables: Record<string, string>,
        readonly path: Path = [],
        readonly aliases: Record<string, unknown> = {},
        readonly index: number | null = null,
        readonly counters: Counters = new Counters(),
    ) {}

    child(item: Record<string, unknown>, path: Path, index: number): Scope {
        return new Scope(item, this.props, this.variables, path, this.aliases, index, this.counters);
    }

    alias(name: string, value: unknown, index: number): Scope {
        return new Scope(this.item, this.props, this.variables, this.path, { ...this.aliases, [name]: value }, index, this.counters);
    }

    aliased(path: string): unknown {
        const [name, ...rest] = path.split('.');
        const value = this.aliases[name ?? ''];
        return rest.length === 0 ? value : read(value, rest.join('.'));
    }

    resolve(path: string): string[] {
        return segments(path).map((segment) => {
            if (!segment.startsWith('{')) return segment;
            const found = this.aliased(segment.slice(1, -1));
            return typeof found === 'string' || typeof found === 'number' ? String(found) : '';
        });
    }

    value(path: string): unknown {
        return read(this.item, this.resolve(path).join('.'));
    }

    absolute(path: string): Path {
        return [...this.path, ...this.resolve(path)];
    }

    prop(path: string): unknown {
        return read(this.props, path);
    }

    variable(key: string): string {
        return this.variables[key] ?? '';
    }

    collect(path: string): unknown[] {
        let values: unknown[] = [this.item];
        for (const segment of this.resolve(path)) {
            const next: unknown[] = [];
            for (const value of values) {
                if (segment === '*') {
                    if (Array.isArray(value)) next.push(...value);
                    else if (isRecord(value)) next.push(...Object.values(value));
                } else if (isRecord(value) && segment in value) {
                    next.push(value[segment]);
                }
            }
            values = next;
        }
        return values;
    }
}

export const parseNumber = (text: unknown): number => {
    if (typeof text === 'number') return text;
    if (typeof text !== 'string') return 0;
    const value = Number.parseFloat(text.trim().replace(',', '.'));
    return Number.isFinite(value) ? value : 0;
};

export const formatTotal = (value: number): string => {
    const fixed = value.toFixed(2);
    return fixed.replace(/0+$/, '').replace(/\.$/, '');
};

export const countOf = (values: unknown[]): number => values.reduce<number>((sum, value) => sum + (Array.isArray(value) ? value.length : 1), 0);
