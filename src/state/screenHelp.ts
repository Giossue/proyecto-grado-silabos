import { listAvailableScreenHelp, type ScreenHelp } from '@/api/screen-help';
import type { Session } from '@/api/session';
import { signal, useSignal } from '@/lib/signal';
import { sessionState, useSession } from '@/state/session';
import { watchSessionKey } from '@/state/sessionKey';

const STORAGE_KEY = 'silabos:ayudas';

type Cache = { key: string; items: ScreenHelp[] };

const readCache = (): Cache | null => {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Cache | null;

        return saved && typeof saved.key === 'string' && Array.isArray(saved.items) ? saved : null;
    } catch {
        return null;
    }
};

const cache = signal<Cache | null>(readCache());

const keyOf = (session: Session | null): string | null =>
    session?.active_role ? `${session.user.id}:${session.active_role.code}` : null;

const itemsOf = (value: Cache | null, key: string | null): ScreenHelp[] =>
    value && value.key === key ? value.items : [];

const load = async (): Promise<void> => {
    const key = keyOf(sessionState.current.value);
    if (!key) return;
    try {
        const result = await listAvailableScreenHelp();
        if (key !== keyOf(sessionState.current.value)) return;
        cache.value = { key, items: result.help };
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cache.value)); } catch { return; }
    } catch {
        return;
    }
};

watchSessionKey(keyOf, (key, previous) => {
    if (key) {
        void load();
    } else if (previous) {
        cache.value = null;
        try { localStorage.removeItem(STORAGE_KEY); } catch { return; }
    }
});

export const screenHelpState = {
    items: (): ScreenHelp[] => itemsOf(cache.value, keyOf(sessionState.current.value)),
    forScreen: (screen: string): ScreenHelp | null =>
        itemsOf(cache.value, keyOf(sessionState.current.value)).find((help) => help.screen === screen) ?? null,
    load,
};

export const useScreenHelp = (screen: string): ScreenHelp | null => {
    const { session } = useSession();
    const value = useSignal(cache);

    return itemsOf(value, keyOf(session)).find((help) => help.screen === screen) ?? null;
};
