import type { Session } from '@/api/session';
import { matchRoute, pathOf, type Shortcut } from '@/lib/routeTable';
import {
  paths,
  roleDocuments,
  roleEntry,
  roleHome,
  roleNotifications,
  roleSetting,
  type RoleCode,
} from '@/lib/routes';

export type RememberedDestination = { value: string; recognized: boolean };

export type GuardResult =
  | { allow: true; remember?: RememberedDestination }
  | { allow: false; redirect: string; remember?: RememberedDestination };

const searchOf = (fullPath: string): string => {
  const query = fullPath.split('#', 1)[0]?.split('?').slice(1).join('?') ?? '';
  return query === '' ? '' : `?${query}`;
};

export const requiresSession = (fullPath: string): boolean => {
  const { meta } = matchRoute(fullPath).record;
  return meta.requiresAuth === true || meta.guest === true;
};

const isProtected = (fullPath: string): boolean => matchRoute(fullPath).record.meta.requiresAuth === true;

const protectedDestination = (fullPath: string): RememberedDestination | undefined => {
  const path = pathOf(fullPath);
  if (path === paths.roleSelection || path === paths.emailVerificationRequired) return undefined;
  return { value: fullPath, recognized: isProtected(fullPath) };
};

const singleQueryValue = (fullPath: string, key: string): string | null => {
  const values = new URLSearchParams(searchOf(fullPath)).getAll(key);
  return values.length === 1 ? values[0] ?? null : null;
};

const shortcutDestination = (shortcut: Shortcut, code: RoleCode, params: Record<string, string>): string => {
  if (shortcut === 'panel') return roleHome(code);
  if (shortcut === 'notifications') return roleNotifications(code);
  if (shortcut === 'profile') return roleSetting(code, 'profile');
  if (shortcut === 'security') return roleSetting(code, 'security');
  return roleDocuments(code, String(params.revision));
};

export const guardNavigation = (fullPath: string, session: Session | null): GuardResult => {
  const { record, params } = matchRoute(fullPath);
  if (record.redirect) return { allow: false, redirect: record.redirect };
  const { meta } = record;
  const path = pathOf(fullPath);

  if (meta.guest === true) {
    const redirect = singleQueryValue(fullPath, 'redirect');
    const remember = !session && redirect !== null ? { value: redirect, recognized: isProtected(redirect) } : undefined;
    if (!session) return { allow: true, remember };
    if (!session.user.email_verified) return { allow: false, redirect: paths.emailVerificationRequired };
    if (!session.active_role) return { allow: false, redirect: paths.roleSelection };
    return { allow: false, redirect: roleEntry(session.active_role.code) };
  }

  if (meta.requiresAuth !== true) return { allow: true };
  if (!session) return { allow: false, redirect: paths.login, remember: { value: fullPath, recognized: true } };
  if (!session.user.email_verified && path !== paths.emailVerificationRequired) {
    return { allow: false, redirect: paths.emailVerificationRequired, remember: protectedDestination(fullPath) };
  }
  if (session.user.email_verified && path === paths.emailVerificationRequired) return { allow: false, redirect: paths.dashboard };
  if (path === paths.root) return { allow: true };
  if (!session.active_role) {
    if (path === paths.roleSelection) return { allow: true };
    return { allow: false, redirect: paths.roleSelection, remember: protectedDestination(fullPath) };
  }

  const code = session.active_role.code;
  if (meta.shortcut) {
    const destination = shortcutDestination(meta.shortcut, code, params);
    if (destination) return { allow: false, redirect: `${destination}${searchOf(fullPath)}` };
  }

  if (meta.roles && !meta.roles.includes(code)) return { allow: false, redirect: roleHome(code) };

  return { allow: true };
};
