import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@/lib/toast';

const sonner = vi.hoisted(() => ({
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: sonner }));

describe('toast', () => {
    beforeEach(() => {
        Object.values(sonner).forEach((method) => method.mockReset());
    });

    it('elimina el punto final de cualquier tipo de aviso', () => {
        toast.success('Cambios guardados.');
        toast.info('Proceso en cola.   ');
        toast.warning('Revisa el campo');
        toast.error('No se pudo guardar.');
        toast.loading('Cargando');

        expect(sonner.success).toHaveBeenCalledWith('Cambios guardados', { id: 'success:Cambios guardados' });
        expect(sonner.info).toHaveBeenCalledWith('Proceso en cola', { id: 'info:Proceso en cola' });
        expect(sonner.warning).toHaveBeenCalledWith('Revisa el campo', { id: 'warning:Revisa el campo', duration: 10000 });
        expect(sonner.error).toHaveBeenCalledWith('No se pudo guardar', { id: 'error:No se pudo guardar', duration: 10000 });
        expect(sonner.loading).toHaveBeenCalledWith('Cargando', { id: 'loading:Cargando' });
    });

    it('el mismo aviso repetido usa el mismo id para no apilarse', () => {
        toast.success('Relación académica agregada.');
        toast.success('Relación académica agregada.');

        expect(sonner.success.mock.calls.map((call) => call[1].id)).toEqual(['success:Relación académica agregada', 'success:Relación académica agregada']);
    });

    it('respeta la duración pedida en errores', () => {
        toast.error('Falló', { duration: 3000 });

        expect(sonner.error).toHaveBeenCalledWith('Falló', { id: 'error:Falló', duration: 3000 });
    });
});
