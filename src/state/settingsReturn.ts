import { signal } from '@/lib/signal';
import { pathOf } from '@/lib/routeTable';
import { paths, routeRegistry } from '@/lib/routes';

const settingsPaths = new Set([
  ...routeRegistry.filter((route) => route.shortcut === 'profile' || route.shortcut === 'security').map((route) => route.path),
  paths.admin.system,
  paths.coordination.emailNotices,
  paths.teacher.emailNotices,
  paths.library.emailNotices,
]);

export const settingsReturn = signal<string | null>(null);

export const trackSettingsReturn = (to: string, from: string | null): void => {
  if (from !== null && settingsPaths.has(pathOf(to)) && !settingsPaths.has(pathOf(from))) settingsReturn.value = from;
};
