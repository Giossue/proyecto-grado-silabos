import { getDeadline, type DashboardDeadline } from '@/api/dashboard';
import type { Session } from '@/api/session';
import { cachedValue, getQueryClient } from '@/lib/queryClient';
import { useSignal, type ReadonlySignal } from '@/lib/signal';
import { dashboardKeys } from '@/queries/dashboard';
import { sessionState, useSession } from '@/state/session';
import { watchSessionKey } from '@/state/sessionKey';
import '@/queries/mutationRefresh';

const FRESH_FOR_MS = 60_000;
const ROLES_WITH_DEADLINE = ['docente', 'coordinador', 'bibliotecario', 'administrador'] as const;

export type DeadlineAudience = (typeof ROLES_WITH_DEADLINE)[number];

const audienceOf = (session: Session | null): DeadlineAudience | null => {
    const code = session?.active_role?.code;

    return ROLES_WITH_DEADLINE.find((role) => role === code) ?? null;
};

const keyOf = (session: Session | null): string | null =>
    session?.active_role && audienceOf(session) ? `${session.user.id}:${session.active_role.id}` : null;

const sessionKey = (): string | null => keyOf(sessionState.current.value);

const queryKeyOf = (key: string | null) => (key ? dashboardKeys.deadline(key) : null);

const deadline = cachedValue<DashboardDeadline | null>(() => queryKeyOf(sessionKey()), null);

const fetchDeadline = async (): Promise<DashboardDeadline | null> => (await getDeadline()).deadline;

getQueryClient().setQueryDefaults(dashboardKeys.deadlines(), { queryFn: fetchDeadline, gcTime: Infinity, retry: false });

const fetchFor = async (staleTime: number): Promise<void> => {
    const key = sessionKey();
    if (!key) return;
    try {
        await getQueryClient().fetchQuery({ queryKey: dashboardKeys.deadline(key), staleTime });
    } catch {
        return;
    }
};

const load = (): Promise<void> => fetchFor(0);

const refresh = (): Promise<void> => fetchFor(FRESH_FOR_MS);

const update = (value: DashboardDeadline | null): void => {
    const key = sessionKey();
    if (!key) return;
    getQueryClient().setQueryData(dashboardKeys.deadline(key), value);
};

watchSessionKey(keyOf, (key, previous) => {
    if (previous) getQueryClient().removeQueries({ queryKey: dashboardKeys.deadline(previous) });
    if (key) void load();
});

export const deadlineState = {
    deadline: deadline as ReadonlySignal<DashboardDeadline | null>,
    audience: (): DeadlineAudience | null => audienceOf(sessionState.current.value),
    load,
    refresh,
    update,
};

export const useDeadline = () => {
    const { session } = useSession();

    return { deadline: useSignal(deadline), audience: audienceOf(session) };
};
