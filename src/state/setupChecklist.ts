import { getDashboard, type SetupChecklist, type SetupStep } from '@/api/dashboard';
import type { Session } from '@/api/session';
import { cachedValue, getQueryClient } from '@/lib/queryClient';
import { signal, useSignal, type ReadonlySignal } from '@/lib/signal';
import { dashboardKeys } from '@/queries/dashboard';
import { sessionState, useSession } from '@/state/session';
import { watchSessionKey } from '@/state/sessionKey';
import '@/queries/mutationRefresh';

const FRESH_FOR_MS = 10_000;
const START_KEYS: Record<string, string> = { administrador: 'process', coordinador: 'convocation' };

const openRequests = signal(0);
const requestOpen = (): void => { openRequests.value += 1; };

const keyOf = (session: Session | null): string | null => {
    const code = session?.active_role?.code;

    return session?.active_role && code && START_KEYS[code] ? `${session.user?.id}:${session.active_role.id}` : null;
};

const sessionKey = (): string | null => keyOf(sessionState.current.value);

const queryKeyOf = (key: string | null) => (key ? dashboardKeys.setup(key) : null);

const setup = cachedValue<SetupChecklist | null>(() => queryKeyOf(sessionKey()), null);

const startKeyOf = (session: Session | null): string | null => START_KEYS[session?.active_role?.code ?? ''] ?? null;

const stepsOf = (checklist: SetupChecklist | null, startKey: string | null): SetupStep[] =>
    (checklist?.steps ?? []).filter((step) => step.key !== startKey);

const startOf = (checklist: SetupChecklist | null, startKey: string | null): SetupStep | null =>
    checklist?.steps.find((step) => step.key === startKey) ?? null;

const update = (checklist: SetupChecklist | null): void => {
    const key = sessionKey();
    if (!key) return;
    getQueryClient().setQueryData(dashboardKeys.setup(key), checklist);
};

const fetchSetup = async (): Promise<SetupChecklist | null> => (await getDashboard()).setup;

getQueryClient().setQueryDefaults(dashboardKeys.setups(), { queryFn: fetchSetup, gcTime: Infinity, retry: false });

const fetchFor = async (staleTime: number): Promise<void> => {
    const key = sessionKey();
    if (!key) return;
    try {
        await getQueryClient().fetchQuery({ queryKey: dashboardKeys.setup(key), staleTime });
    } catch {
        return;
    }
};

const load = (): Promise<void> => fetchFor(0);

const refresh = (): Promise<void> => fetchFor(FRESH_FOR_MS);

watchSessionKey(keyOf, (key, previous) => {
    if (previous) getQueryClient().removeQueries({ queryKey: dashboardKeys.setup(previous) });
    if (key) void load();
});

export const setupChecklistState = {
    setup: setup as ReadonlySignal<SetupChecklist | null>,
    startKey: (): string | null => startKeyOf(sessionState.current.value),
    steps: (): SetupStep[] => stepsOf(setup.value, startKeyOf(sessionState.current.value)),
    start: (): SetupStep | null => startOf(setup.value, startKeyOf(sessionState.current.value)),
    load,
    refresh,
    update,
    openRequests: openRequests as ReadonlySignal<number>,
    requestOpen,
};

export const useSetupChecklist = () => {
    const { session } = useSession();
    const checklist = useSignal(setup);
    const startKey = startKeyOf(session);

    return {
        setup: checklist,
        startKey,
        steps: stepsOf(checklist, startKey),
        start: startOf(checklist, startKey),
        openRequests: useSignal(openRequests),
    };
};
