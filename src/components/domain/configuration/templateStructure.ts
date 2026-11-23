import { ApiError } from '@/api/client';

export const uniqueKey = (name: string, fallback: string, used: Iterable<string>): string => {
    const taken = new Set(used);
    const base = (name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[0-9]+/, '').slice(0, 80) || fallback);
    let key = base;
    for (let n = 2; taken.has(key); n += 1) key = `${base}_${n}`;
    return key;
};

export const apiMessage = (reason: unknown, fallback: string): string => {
    if (reason instanceof ApiError) return Object.values(reason.errors)[0]?.[0] ?? reason.message;
    return fallback;
};
