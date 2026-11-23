import type { Session } from '@/api/session';
import { useSession } from '@/state/session';

export const ROLES_WITHOUT_SIDEBAR: readonly string[] = ['docente', 'bibliotecario'];

export const showsSidebarFor = (session: Session | null): boolean =>
    !ROLES_WITHOUT_SIDEBAR.includes(session?.active_role?.code ?? '');

export function useShowsSidebar(): boolean {
    return showsSidebarFor(useSession().session);
}
