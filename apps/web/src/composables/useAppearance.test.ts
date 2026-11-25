import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ChangeListener = (event: MediaQueryListEvent) => void;

const listeners: ChangeListener[] = [];

const mockSystemScheme = (dark: boolean): void => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
        matches: query === '(prefers-color-scheme: dark)' && dark,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((type: string, listener: ChangeListener) => {
            if (type === 'change' && query === '(prefers-color-scheme: dark)') listeners.push(listener);
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList);
};

const changeSystemScheme = (dark: boolean): void => {
    listeners.forEach((listener) => listener({ matches: dark } as MediaQueryListEvent));
};

const load = async () => {
    vi.resetModules();

    return import('@/composables/useAppearance');
};

describe('tema visual', () => {
    beforeEach(() => {
        listeners.length = 0;
        localStorage.clear();
        document.documentElement.classList.remove('dark');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        document.documentElement.classList.remove('dark');
    });

    it('sin una elección guardada sigue el tema oscuro del sistema', async () => {
        mockSystemScheme(true);
        const { initializeTheme } = await load();

        initializeTheme();

        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(localStorage.getItem('appearance')).toBeNull();
    });

    it('sin una elección guardada sigue el tema claro del sistema', async () => {
        mockSystemScheme(false);
        const { initializeTheme } = await load();

        initializeTheme();

        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('cambia con el sistema mientras no haya una elección guardada', async () => {
        mockSystemScheme(false);
        const { initializeTheme } = await load();
        initializeTheme();

        changeSystemScheme(true);
        expect(document.documentElement.classList.contains('dark')).toBe(true);

        changeSystemScheme(false);
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('una elección guardada manda sobre el sistema', async () => {
        mockSystemScheme(true);
        localStorage.setItem('appearance', 'light');
        const { initializeTheme, updateAppearance } = await load();

        initializeTheme();
        expect(document.documentElement.classList.contains('dark')).toBe(false);

        updateAppearance('dark');
        changeSystemScheme(false);
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(localStorage.getItem('appearance')).toBe('dark');
    });
});
