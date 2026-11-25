import { updateAccessibility, type AccessibilityPreferences } from '@/api/session';
import { signal, useSignal } from '@/lib/signal';
import { sessionState } from '@/state/session';

export type TextSize = '100' | '115' | '130' | '150';
export type AccessibilitySettings = {
    highContrast: boolean;
    textSize: TextSize;
    noMotion: boolean;
    dyslexia: boolean;
};

const STORAGE_KEY = 'silabos:accesibilidad';
export const TEXT_SIZES: readonly TextSize[] = ['100', '115', '130', '150'];

const prefersReducedMotion = (): boolean =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

export const defaultSettings = (): AccessibilitySettings => ({
    highContrast: false,
    textSize: '100',
    noMotion: prefersReducedMotion(),
    dyslexia: false,
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
            dyslexia: typeof saved.dyslexia === 'boolean' ? saved.dyslexia : defaults.dyslexia,
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
    root.dataset.dyslexia = settings.dyslexia ? 'on' : 'off';
};

const settings = signal<AccessibilitySettings>(defaultSettings());

const toServer = (value: AccessibilitySettings): AccessibilityPreferences => ({
    high_contrast: value.highContrast,
    text_size: value.textSize,
    no_motion: value.noMotion,
    dyslexia: value.dyslexia,
});

const fromServer = (value: AccessibilityPreferences): AccessibilitySettings => ({
    highContrast: value.high_contrast,
    textSize: TEXT_SIZES.includes(value.text_size as TextSize) ? (value.text_size as TextSize) : '100',
    noMotion: value.no_motion,
    dyslexia: value.dyslexia === true,
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

// Set while applying a change that did not come from this tab's user (system or another tab): nothing is saved.
let external = false;
// Set while restoring the defaults: the stored entry is removed instead of rewritten, so the system is followed again.
let clearing = false;

const withoutSaving = (apply: () => void): void => {
    external = true;
    try {
        apply();
    } finally {
        external = false;
    }
};

settings.subscribe(() => {
    const value = settings.value;
    applyAccessibility(value);
    if (external) return;
    if (!clearing) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { return; }
    }
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
            reset();
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
    withoutSaving(() => { setSettings({ ...settings.value, noMotion: event.matches }); });
};

const followOtherTabs = (event: StorageEvent): void => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    withoutSaving(() => { setSettings(read()); });
};

let followingSystem = false;

export function initializeAccessibility(): void {
    if (typeof window === 'undefined') return;
    setSettings(read());
    applyAccessibility(settings.value);
    if (followingSystem) return;
    followingSystem = true;
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change', followSystemMotion);
    window.addEventListener('storage', followOtherTabs);
}

const update = (patch: Partial<AccessibilitySettings>): void => {
    setSettings({ ...settings.value, ...patch });
};

const reset = (): void => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* the defaults still apply */ }
    clearing = true;
    try {
        setSettings(defaultSettings());
    } finally {
        clearing = false;
    }
};

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
