import { signal, useSignal, type ReadonlySignal } from '@/lib/signal';

export const FINALIZED_NOTICE = 'convocatoria_finalizada';

const open = signal(false);
const message = signal('');
const count = signal(0);
const mode = signal<string | null>(null);
let retry: (() => Promise<void> | void) | null = null;
let onCancel: (() => void) | null = null;

export function registerLocalPurgeConfirmation(url: string): () => void {
    void url;
    return () => undefined;
}

export function requestPurgeConfirmation(
    purgeMessage: string,
    purgeCount: number,
    confirmedRequest: () => Promise<void> | void,
    cancelled?: () => void,
    purgeMode?: string,
): void {
    onCancel?.();
    onCancel = cancelled ?? null;
    message.value = purgeMessage;
    count.value = purgeCount;
    mode.value = purgeMode ?? null;
    retry = confirmedRequest;
    open.value = true;
}

const confirm = async (): Promise<void> => {
    const operation = retry;
    open.value = false;
    retry = null;
    onCancel = null;
    await operation?.();
};

const cancel = (): void => {
    const cancelled = onCancel;
    open.value = false;
    retry = null;
    onCancel = null;
    cancelled?.();
};

export const purgeConfirmation = {
    open: open as ReadonlySignal<boolean>,
    message: message as ReadonlySignal<string>,
    count: count as ReadonlySignal<number>,
    mode: mode as ReadonlySignal<string | null>,
    confirm,
    cancel,
};

export function usePurgeConfirmation() {
    return {
        open: useSignal(open),
        message: useSignal(message),
        count: useSignal(count),
        mode: useSignal(mode),
        confirm,
        cancel,
    };
}
