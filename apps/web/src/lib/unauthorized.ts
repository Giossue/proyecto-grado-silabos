import type { Session } from '@/api/session';
import { rememberIntendedRoute } from '@/lib/intended-route';
import { matchRoute, pathOf } from '@/lib/routeTable';
import { paths } from '@/lib/routes';
import { sessionState } from '@/state/session';

export type ReplaceNavigator = { replace: (href: string) => void };

const currentFullPath = (): string =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

export const handleUnauthorized = (router: ReplaceNavigator): void => {
  if (!sessionState.current.value) return;

  const redirect = currentFullPath();
  sessionState.clear();
  rememberIntendedRoute(redirect, matchRoute(redirect).record.meta.requiresAuth === true);

  if (pathOf(redirect) !== paths.login) {
    router.replace(paths.login);
  }
};

export const handleRoleRequired = (router: ReplaceNavigator): void => {
  const session = sessionState.current.value;
  if (!session) return;

  sessionState.replace({ ...(session as Session), active_role: null });

  if (pathOf(currentFullPath()) !== paths.roleSelection) {
    router.replace(paths.roleSelection);
  }
};
