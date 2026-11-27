import { signal, useSignal } from '@/lib/signal';
import type { Appearance, ResolvedAppearance } from '@/types';

export type { Appearance, ResolvedAppearance };

export type UseAppearanceReturn = {
    appearance: Appearance;
    resolvedAppearance: ResolvedAppearance;
    updateAppearance: (value: Appearance) => void;
};

export const DEFAULT_APPEARANCE: Appearance = 'light';

const isAppearance = (value: unknown): value is Appearance =>
    value === 'light' || value === 'dark';

export function updateTheme(value: Appearance): void {
    if (typeof window === 'undefined') {
        return;
    }

    document.documentElement.classList.toggle('dark', value === 'dark');
}

const setCookie = (name: string, value: string, days = 365) => {
    if (typeof document === 'undefined') {
        return;
    }

    const maxAge = days * 24 * 60 * 60;

    document.cookie = `${name}=${value};path=/;max-age=${maxAge};SameSite=Lax`;
};

const savedAppearance = (): Appearance | null => {
    try {
        const stored = localStorage.getItem('appearance');

        return isAppearance(stored) ? stored : null;
    } catch {
        return null;
    }
};

const getStoredAppearance = (): Appearance => {
    if (typeof window === 'undefined') {
        return DEFAULT_APPEARANCE;
    }

    return savedAppearance() ?? DEFAULT_APPEARANCE;
};

const appearance = signal<Appearance>(DEFAULT_APPEARANCE);

export function initializeTheme(): void {
    if (typeof window === 'undefined') {
        return;
    }

    appearance.value = getStoredAppearance();
    updateTheme(appearance.value);
}

export function updateAppearance(value: Appearance): void {
    appearance.value = value;

    localStorage.setItem('appearance', value);

    setCookie('appearance', value);

    updateTheme(value);
}

export function useAppearance(): UseAppearanceReturn {
    const current = useSignal(appearance);

    return {
        appearance: current,
        resolvedAppearance: current,
        updateAppearance,
    };
}
