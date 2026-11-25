import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollBehavior } from '@/lib/motion';

const mockReducedMotion = (matches: boolean): void => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)' && matches,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }) as MediaQueryList);
};

describe('scrollBehavior', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        delete document.documentElement.dataset.motion;
    });

    it('desplaza con suavidad cuando no se pide reducir el movimiento', () => {
        mockReducedMotion(false);
        document.documentElement.dataset.motion = 'normal';

        expect(scrollBehavior()).toBe('smooth');
    });

    it('desplaza sin animación cuando la persona desactiva el movimiento', () => {
        mockReducedMotion(false);
        document.documentElement.dataset.motion = 'none';

        expect(scrollBehavior()).toBe('auto');
    });

    it('desplaza sin animación cuando el sistema pide reducir el movimiento', () => {
        mockReducedMotion(true);

        expect(scrollBehavior()).toBe('auto');
    });
});
