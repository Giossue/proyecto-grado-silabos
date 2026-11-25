import { roleLabel } from '@/lib/roles';
import { routeRegistry, type RoleCode, type RouteDefinition } from '@/lib/routes';

export type HelpScreen = { key: string; label: string; role: RoleCode; roleLabel: string };

const shortcutLabels: Record<NonNullable<RouteDefinition['shortcut']>, string> = {
  panel: 'Panel',
  notifications: 'Notificaciones',
  profile: 'Perfil',
  security: 'Seguridad',
  documents: 'Documentos',
};

const labelOf = (route: RouteDefinition): string => route.breadcrumb ?? (route.shortcut ? shortcutLabels[route.shortcut] : route.name);

const screens = routeRegistry
  .filter((route) => route.component !== undefined && route.requiresAuth === true && route.roles?.length === 1 && route.layout === undefined)
  .map((route) => {
    const role = route.roles?.[0] as RoleCode;
    return { key: route.path, label: labelOf(route), role, roleLabel: roleLabel(role) };
  });

export const helpScreens: readonly HelpScreen[] = screens.filter(
  (screen, index) => screens.findIndex((other) => other.role === screen.role && other.label === screen.label) === index,
);
