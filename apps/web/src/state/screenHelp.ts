import { listAvailableScreenHelp, type ScreenHelp } from '@/api/screen-help';
import type { Session } from '@/api/session';
import { cachedValue, getQueryClient } from '@/lib/queryClient';
import { useSignal } from '@/lib/signal';
import { screenHelpKeys } from '@/queries/screenHelp';
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

const keyOf = (session: Session | null): string | null =>
    session?.active_role ? `${session.user.id}:${session.active_role.code}` : null;

const fetchHelp = async (): Promise<ScreenHelp[]> => (await listAvailableScreenHelp()).help;

getQueryClient().setQueryDefaults(screenHelpKeys.all, { queryFn: fetchHelp, gcTime: Infinity, retry: false });

const saved = typeof window === 'undefined' ? null : readCache();
if (saved) getQueryClient().setQueryData(screenHelpKeys.available(saved.key), saved.items);

const items = cachedValue<ScreenHelp[]>(() => {
    const key = keyOf(sessionState.current.value);

    return key ? screenHelpKeys.available(key) : null;
}, []);

const load = async (): Promise<void> => {
    const key = keyOf(sessionState.current.value);
    if (!key) return;
    try {
        const help = await getQueryClient().fetchQuery<ScreenHelp[]>({ queryKey: screenHelpKeys.available(key), staleTime: 0 });
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ key, items: help })); } catch { return; }
    } catch {
        return;
    }
};

watchSessionKey(keyOf, (key, previous) => {
    if (key) {
        void load();
    } else if (previous) {
        getQueryClient().removeQueries({ queryKey: screenHelpKeys.all });
        try { localStorage.removeItem(STORAGE_KEY); } catch { return; }
    }
});

const find = (list: ScreenHelp[], screen: string): ScreenHelp | null => list.find((help) => help.screen === screen) ?? null;

export const screenHelpState = {
    items: (): ScreenHelp[] => items.value,
    forScreen: (screen: string): ScreenHelp | null => find(items.value, screen),
    load,
};

export const useScreenHelp = (screen: string): ScreenHelp | null => {
    useSession();

    return find(useSignal(items), screen);
};
