import { paths, routeRegistry } from '@/lib/routes';

const STORAGE_KEY = 'silabos.intended-route';

const publicPaths: Set<string> = new Set([
  paths.login,
  paths.passwordRecovery,
  paths.passwordReset,
  paths.twoFactorChallenge,
]);

const isInternalPath = (value: string): boolean =>
  value.startsWith('/') && !value.startsWith('//') && !value.includes('://');

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matchesRoute = (pattern: string, path: string): boolean => {
  const expression = pattern
    .split('/')
    .map((part) => part.startsWith(':') ? '[^/]+' : escapeRegex(part))
    .join('/');
  return new RegExp(`^${expression}$`).test(path);
};
const isRecognizedProtectedPath = (value: string): boolean => {
  const pathname = value.split(/[?#]/, 1)[0] ?? value;
  return routeRegistry.some((route) => route.requiresAuth === true && matchesRoute(route.path, pathname));
};

export const isValidIntendedRoute = (value: unknown): value is string =>
  typeof value === 'string'
  && isInternalPath(value)
  && !publicPaths.has(value.split('?')[0]?.split('#')[0] ?? '')
  && isRecognizedProtectedPath(value);

export const rememberIntendedRoute = (value: unknown, recognized = true): void => {
  if (!recognized || !isValidIntendedRoute(value)) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, value);
  } catch {
  }
};

export const consumeIntendedRoute = (): string | null => {
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
    return isValidIntendedRoute(value) ? value : null;
  } catch {
    return null;
  }
};

export const clearIntendedRoute = (): void => {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
  }
};
