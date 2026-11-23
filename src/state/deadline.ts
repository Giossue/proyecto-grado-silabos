import { getDeadline, type DashboardDeadline } from '@/api/dashboard';
import type { Session } from '@/api/session';
import { signal, useSignal, type ReadonlySignal } from '@/lib/signal';
import { sessionState, useSession } from '@/state/session';
import { watchSessionKey } from '@/state/sessionKey';

const FRESH_FOR_MS = 60_000;
const ROLES_WITH_DEADLINE = ['docente', 'coordinador', 'bibliotecario', 'administrador'] as const;

export type DeadlineAudience = (typeof ROLES_WITH_DEADLINE)[number];

const deadline = signal<DashboardDeadline | null>(null);
let loadedAt = 0;

const audienceOf = (session: Session | null): DeadlineAudience | null => {
    const code = session?.active_role?.code;

    return ROLES_WITH_DEADLINE.find((role) => role === code) ?? null;
};

const keyOf = (session: Session | null): string | null =>
    session?.active_role && audienceOf(session) ? `${session.user.id}:${session.active_role.id}` : null;

const sessionKey = (): string | null => keyOf(sessionState.current.value);

const load = async (): Promise<void> => {
    const key = sessionKey();
    if (!key) return;
    try {
        const result = await getDeadline();
        if (key !== sessionKey()) return;
        deadline.value = result.deadline;
        loadedAt = Date.now();
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
        mutationTimer = setTimeout(() => { void load(); }, 400);
    });
}

watchSessionKey(keyOf, (key) => {
    deadline.value = null;
    loadedAt = 0;
    if (key) void load();
});

export const deadlineState = {
    deadline: deadline as ReadonlySignal<DashboardDeadline | null>,
    audience: (): DeadlineAudience | null => audienceOf(sessionState.current.value),
    load,
    refresh,
};

export const useDeadline = () => {
    const { session } = useSession();

    return { deadline: useSignal(deadline), audience: audienceOf(session) };
};
