import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '@/api/client';

const jsonResponse = (status: number, payload: unknown = {}): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('cliente API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('envía una mutación en una sola petición con la cookie de sesión y sin token XSRF', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return jsonResponse(200, { saved: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api<{ saved: boolean }>('/resource', { method: 'POST', body: '{}' }))
      .resolves.toEqual({ saved: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/v1/resource');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include', method: 'POST' });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty('X-XSRF-TOKEN');
  });

  it('notifica globalmente cuando la sesión dejó de ser válida', async () => {
    const listener = vi.fn();
    window.addEventListener('silabos:unauthorized', listener, { once: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, { message: 'No autenticado' })));

    await expect(api('/session')).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('notifica globalmente cuando la sesión perdió el rol elegido', async () => {
    const listener = vi.fn();
    window.addEventListener('silabos:role-required', listener, { once: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(409, { message: 'Seleccione un rol vigente' })));

    await expect(api('/coordination/reviews')).rejects.toMatchObject({ status: 409 });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('conserva el 403 como denegación y no como pérdida de sesión', async () => {
    const listener = vi.fn();
    window.addEventListener('silabos:unauthorized', listener);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, { message: 'No autorizado' })));

    await expect(api('/admin/usuarios')).rejects.toMatchObject({
      status: 403,
      message: 'No autorizado',
    } satisfies Partial<ApiError>);
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('silabos:unauthorized', listener);
  });

  it('avisa cuando una mutación termina bien, para refrescar lo que depende de ella; una lectura no avisa', async () => {
    const listener = vi.fn();
    window.addEventListener('silabos:mutated', listener);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { saved: true })));

    await api('/resource');
    expect(listener).not.toHaveBeenCalled();
    await api('/resource', { method: 'POST', body: '{}' });
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener('silabos:mutated', listener);
  });
});
