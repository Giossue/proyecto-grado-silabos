import { withoutFinalPeriod } from '@/lib/utils';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors: Record<string, string[]> = {},
    readonly payload: Record<string, unknown> = {},
  ) {
    super(withoutFinalPeriod(message));
    this.errors = Object.fromEntries(Object.entries(errors).map(([field, messages]) => [field, messages.map(withoutFinalPeriod)]));
  }
}

const baseUrl = '';

const readCookie = (name: string): string | null => {
  const prefix = `${name}=`;
  const value = document.cookie.split('; ').find((cookie) => cookie.startsWith(prefix));

  return value ? decodeURIComponent(value.slice(prefix.length)) : null;
};

export async function initializeCsrfProtection(): Promise<void> {
  const response = await fetch(`${baseUrl}/sanctum/csrf-cookie`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new ApiError('No se pudo preparar la sesión segura', response.status);
  }
}

const isReadOnlyRequest = (method: string): boolean => method === 'GET' || method === 'HEAD';

const notifyUnauthorized = (): void => {
  window.dispatchEvent(new CustomEvent('silabos:unauthorized'));
};

/** Una mutación terminó bien: lo que depende de los datos (la guía «Antes de empezar») se refresca sin recargar. */
const notifyMutated = (method: string): void => {
  if (!isReadOnlyRequest(method)) window.dispatchEvent(new CustomEvent('silabos:mutated'));
};

const ROLE_REQUIRED_MESSAGE = 'Seleccione un rol vigente';

const notifyRoleRequired = (): void => {
  window.dispatchEvent(new CustomEvent('silabos:role-required'));
};

const sendApiRequest = (path: string, init: RequestInit, method: string): Promise<Response> => {
  const csrfToken = isReadOnlyRequest(method) ? null : readCookie('XSRF-TOKEN');
  const isFormData = init.body instanceof FormData;

  return fetch(`${baseUrl}/api/v1${path}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(csrfToken ? { 'X-XSRF-TOKEN': csrfToken } : {}),
      ...init.headers,
    },
    ...init,
  });
};

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();

  if (!isReadOnlyRequest(method) && readCookie('XSRF-TOKEN') === null) {
    await initializeCsrfProtection();
  }

  let response = await sendApiRequest(path, init, method);

  if (response.status === 419 && !isReadOnlyRequest(method)) {
    await initializeCsrfProtection();
    response = await sendApiRequest(path, init, method);
  }

  if (response.status === 401) notifyUnauthorized();

  if (response.status === 204) {
    notifyMutated(method);
    return undefined as T;
  }

  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    errors?: Record<string, string[]>;
  };

  if (response.status === 409 && payload.message === ROLE_REQUIRED_MESSAGE) notifyRoleRequired();

  if (!response.ok) {
    throw new ApiError(payload.message ?? 'No se pudo completar la solicitud', response.status, payload.errors, payload);
  }

  notifyMutated(method);
  return payload as T;
}

export async function apiBlob(path: string): Promise<Blob> {
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    credentials: 'include',
    headers: { Accept: 'application/octet-stream' },
  });

  if (response.status === 401) notifyUnauthorized();

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string; errors?: Record<string, string[]> };
    throw new ApiError(payload.message ?? 'No se pudo descargar el archivo', response.status, payload.errors ?? {});
  }

  return response.blob();
}
