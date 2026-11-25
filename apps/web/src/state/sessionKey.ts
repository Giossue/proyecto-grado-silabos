import type { Session } from '@/api/session';
import { sessionState } from '@/state/session';

export type SessionKeyOf = (session: Session | null) => string | null;

export const watchSessionKey = (
    keyOf: SessionKeyOf,
    onChange: (key: string | null, previous: string | null) => void,
): (() => string | null) => {
    let current = keyOf(sessionState.current.value);
    sessionState.current.subscribe(() => {
        const next = keyOf(sessionState.current.value);
        if (next === current) return;
        const previous = current;
        current = next;
        onChange(next, previous);
    });
    onChange(current, null);

    return () => keyOf(sessionState.current.value);
};
