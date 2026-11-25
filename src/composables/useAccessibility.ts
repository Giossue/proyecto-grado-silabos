import { updateAccessibility, type AccessibilityPreferences } from '@/api/session';
import { signal, useSignal } from '@/lib/signal';
import { sessionState } from '@/state/session';

export type TextSize = '100' | '115' | '130' | '150';
export type AccessibilitySettings = {
    highContrast: boolean;
    textSize: TextSize;
    noMotion: boolean;
    wideSpacing: boolean;
};

const STORAGE_KEY = 'silabos:accesibilidad';
export const TEXT_SIZES: readonly TextSize[] = ['100', '115', '130', '150'];

const prefersReducedMotion = (): boolean =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

export const defaultSettings = (): AccessibilitySettings => ({
    highContrast: false,
    textSize: '100',
    noMotion: prefersReducedMotion(),
    wideSpacing: false,
});

const read = (): AccessibilitySettings => {
    const defaults = defaultSettings();
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<AccessibilitySettings> | null;
        if (!saved || typeof saved !== 'object') return defaults;
        return {
            highContrast: typeof saved.highContrast === 'boolean' ? saved.highContrast : defaults.highContrast,
            textSize: TEXT_SIZES.includes(saved.textSize as TextSize) ? (saved.textSize as TextSize) : defaults.textSize,
            noMotion: typeof saved.noMotion === 'boolean' ? saved.noMotion : defaults.noMotion,
            wideSpacing: typeof saved.wideSpacing === 'boolean' ? saved.wideSpacing : defaults.wideSpacing,
        };
    } catch {
        return defaults;
    }
};

export const applyAccessibility = (settings: AccessibilitySettings): void => {
    const root = document.documentElement;
    root.dataset.contrast = settings.highContrast ? 'high' : 'normal';
    root.dataset.textSize = settings.textSize;
    root.dataset.motion = settings.noMotion ? 'none' : 'normal';
    root.dataset.spacing = settings.wideSpacing ? 'wide' : 'normal';
};

const settings = signal<AccessibilitySettings>(defaultSettings());

const toServer = (value: AccessibilitySettings): AccessibilityPreferences => ({
    high_contrast: value.highContrast,
    text_size: value.textSize,
    no_motion: value.noMotion,
    wide_spacing: value.wideSpacing,
});

const fromServer = (value: AccessibilityPreferences): AccessibilitySettings => ({
    highContrast: value.high_contrast,
    textSize: TEXT_SIZES.includes(value.text_size as TextSize) ? (value.text_size as TextSize) : '100',
    noMotion: value.no_motion,
    wideSpacing: value.wide_spacing,
});

let known = '';
let timer: number | undefined;

const saveToAccount = (): void => {
    if (!sessionState.current.value) return;
    const payload = toServer(settings.value);
    const serialized = JSON.stringify(payload);
    if (serialized === known) return;
    known = serialized;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { void updateAccessibility(payload).catch(() => { known = ''; }); }, 500);
};

const setSettings = (value: AccessibilitySettings): void => {
    if (JSON.stringify(value) === JSON.stringify(settings.value)) return;
    settings.value = value;
};

let fromSystem = false;

settings.subscribe(() => {
    const value = settings.value;
    applyAccessibility(value);
    if (fromSystem) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { return; }
    saveToAccount();
});

let hadSession = false;

sessionState.current.subscribe(() => {
    const session = sessionState.current.value;
    if (!session) {
        known = '';
        if (typeof window !== 'undefined') window.clearTimeout(timer);
        if (hadSession) {
            hadSession = false;
            try { localStorage.removeItem(STORAGE_KEY); } catch { return; }
            setSettings(defaultSettings());
        }
        return;
    }
    hadSession = true;
    const stored = session.user.accessibility;
    if (stored) {
        known = JSON.stringify(stored);
        setSettings(fromServer(stored));
        return;
    }
    known = '';
    saveToAccount();
});

const hasSavedSettings = (): boolean => {
    try {
        return localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
        return false;
    }
};

const followSystemMotion = (event: MediaQueryListEvent): void => {
    if (hasSavedSettings()) return;
    fromSystem = true;
    try {
        setSettings({ ...settings.value, noMotion: event.matches });
    } finally {
        fromSystem = false;
    }
};

let followingSystem = false;

export function initializeAccessibility(): void {
    if (typeof window === 'undefined') return;
    setSettings(read());
    applyAccessibility(settings.value);
    if (followingSystem) return;
    followingSystem = true;
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change', followSystemMotion);
}

const update = (patch: Partial<AccessibilitySettings>): void => {
    setSettings({ ...settings.value, ...patch });
};

const reset = (): void => { setSettings(defaultSettings()); };

export const accessibilitySettings = {
    get value(): AccessibilitySettings {
        return settings.value;
    },
    update,
    reset,
};

export function useAccessibility() {
    return { settings: useSignal(settings), update, reset };
}
