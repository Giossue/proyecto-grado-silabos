import { signal, useSignal, type ReadonlySignal } from '@/lib/signal';

type InstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const deferred = signal<InstallPromptEvent | null>(null);
const installed = signal(false);
let initialized = false;

const runningInstalled = (): boolean =>
    window.matchMedia?.('(display-mode: standalone)').matches === true
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIos = (): boolean =>
    /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const initializeInstallApp = (): void => {
    installed.value = runningInstalled();
    if (initialized) return;
    initialized = true;
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        deferred.value = event as InstallPromptEvent;
    });
    window.addEventListener('appinstalled', () => {
        installed.value = true;
        deferred.value = null;
    });
};

const install = async (): Promise<boolean> => {
    const event = deferred.value;
    if (!event) return false;
    await event.prompt();
    const { outcome } = await event.userChoice;
    deferred.value = null;
    if (outcome === 'accepted') installed.value = true;

    return outcome === 'accepted';
};

export const installAppState = {
    installed: installed as ReadonlySignal<boolean>,
    canPrompt: (): boolean => deferred.value !== null,
    platform: (): 'ios' | 'other' => (isIos() ? 'ios' : 'other'),
    install,
};

export const useInstallApp = () => ({
    installed: useSignal(installed),
    canPrompt: useSignal(deferred) !== null,
});
