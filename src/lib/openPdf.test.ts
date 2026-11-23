import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadDocument, getDocuments } from '@/api/documents';
import { openRevisionPdf } from '@/lib/openPdf';

vi.mock('@/api/documents', () => ({ getDocuments: vi.fn(), downloadDocument: vi.fn() }));

const artifact = (id: string, estado: string, requested_at: string) => ({ id, estado, requested_at, completed_at: null, error: null, files: estado === 'completado' ? { pdf_size: 1 } : null });

describe('openRevisionPdf', () => {
  const tab = { location: { href: '' }, close: vi.fn(), focus: vi.fn() };

  beforeEach(() => {
    tab.location.href = '';
    tab.close.mockReset();
    tab.focus.mockReset();
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    URL.createObjectURL = vi.fn(() => 'blob:pdf');
    URL.revokeObjectURL = vi.fn();
    vi.mocked(downloadDocument).mockReset().mockResolvedValue(new Blob(['x']));
  });

  it('abre en otra pestaña el PDF completado más reciente', async () => {
    vi.mocked(getDocuments).mockResolvedValue({ artifacts: [artifact('viejo', 'completado', '2026-10-01T00:00:00Z'), artifact('nuevo', 'completado', '2026-10-02T00:00:00Z'), artifact('fallido', 'fallido', '2026-10-03T00:00:00Z')] } as never);

    expect(await openRevisionPdf('rev-1')).toBeNull();
    expect(window.open).toHaveBeenCalledWith('', 'silabos-pdf', expect.stringContaining('popup=yes'));
    expect(downloadDocument).toHaveBeenCalledWith('nuevo');
    expect(tab.location.href).toBe('blob:pdf');
  });

  it('trae al frente la ventana del PDF aunque ya estuviera abierta detrás', async () => {
    vi.mocked(getDocuments).mockResolvedValue({ artifacts: [artifact('a', 'completado', '2026-10-01T00:00:00Z')] } as never);

    await openRevisionPdf('rev-1');
    await openRevisionPdf('rev-1');

    expect(tab.focus.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('avisa y cierra la pestaña si el PDF todavía no está listo', async () => {
    vi.mocked(getDocuments).mockResolvedValue({ artifacts: [artifact('a', 'pendiente', '2026-10-01T00:00:00Z')] } as never);

    expect(await openRevisionPdf('rev-1')).toBe('El PDF aún no está listo');
    expect(tab.close).toHaveBeenCalled();
    expect(downloadDocument).not.toHaveBeenCalled();
  });
});
