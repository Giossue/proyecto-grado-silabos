import { toast as sonnerToast } from 'sonner';

type ToastMessage = Parameters<typeof sonnerToast>[0];
type ToastOptions = Parameters<typeof sonnerToast>[1];

const normalizeMessage = (message: ToastMessage): ToastMessage =>
    typeof message === 'string' ? message.replace(/\.\s*$/, '') : message;

const LONG_TOAST_MS = 10000;

const show = (
    type: 'success' | 'info' | 'warning' | 'error' | 'loading',
    message: ToastMessage,
    options?: ToastOptions,
): string | number => {
    const text = normalizeMessage(message);
    const id = typeof text === 'string' ? `${type}:${text}` : undefined;

    return sonnerToast[type](text, {
        ...(id ? { id } : {}),
        ...(type === 'error' || type === 'warning' ? { duration: LONG_TOAST_MS } : {}),
        ...options,
    });
};

export const toast = {
    success: (message: ToastMessage, options?: ToastOptions) =>
        show('success', message, options),
    info: (message: ToastMessage, options?: ToastOptions) =>
        show('info', message, options),
    warning: (message: ToastMessage, options?: ToastOptions) =>
        show('warning', message, options),
    error: (message: ToastMessage, options?: ToastOptions) =>
        show('error', message, options),
    loading: (message: ToastMessage, options?: ToastOptions) =>
        show('loading', message, options),
    dismiss: sonnerToast.dismiss,
};

