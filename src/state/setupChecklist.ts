import { getDashboard, type SetupChecklist, type SetupStep } from '@/api/dashboard';
import type { Session } from '@/api/session';
import { signal, useSignal, type ReadonlySignal } from '@/lib/signal';
import { sessionState, useSession } from '@/state/session';
import { watchSessionKey } from '@/state/sessionKey';

const FRESH_FOR_MS = 10_000;
const AFTER_MUTATION_MS = 400;
const START_KEYS: Record<string, string> = { administrador: 'process', coordinador: 'convocation' };

const setup = signal<SetupChecklist | null>(null);
let loadedAt = 0;
const openRequests = signal(0);
const requestOpen = (): void => { openRequests.value += 1; };

const keyOf = (session: Session | null): string | null => {
    const code = session?.active_role?.code;

    return session?.active_role && code && START_KEYS[code] ? `${session.user?.id}:${session.active_role.id}` : null;
};

const sessionKey = (): string | null => keyOf(sessionState.current.value);

const startKeyOf = (session: Session | null): string | null => START_KEYS[session?.active_role?.code ?? ''] ?? null;

const stepsOf = (checklist: SetupChecklist | null, startKey: string | null): SetupStep[] =>
    (checklist?.steps ?? []).filter((step) => step.key !== startKey);

const startOf = (checklist: SetupChecklist | null, startKey: string | null): SetupStep | null =>
    checklist?.steps.find((step) => step.key === startKey) ?? null;

const update = (checklist: SetupChecklist | null): void => {
    setup.value = checklist;
    loadedAt = Date.now();
};

const load = async (): Promise<void> => {
    const key = sessionKey();
    if (!key) return;
    try {
        const dashboard = await getDashboard();
        if (key === sessionKey()) update(dashboard.setup);
    } catch {
        return;
    }
};

const refresh = async (): Promise<void> => {
    if (Date.now() - loadedAt >= FRESH_FOR_MS) await load();
};

let mutationTimer: ReturnType<typeof setTimeout> | undefined;
if (typeof window !== 'undefined') {
    window.addEventListener('silabos:mutated', () => {
        if (!sessionKey()) return;
        clearTimeout(mutationTimer);
        mutationTimer = setTimeout(() => { void load(); }, AFTER_MUTATION_MS);
    });
}

watchSessionKey(keyOf, (key) => {
    setup.value = null;
    loadedAt = 0;
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
