import { toast as sonnerToast } from 'vue-sonner';

type ToastMessage = Parameters<typeof sonnerToast>[0];
type ToastOptions = Parameters<typeof sonnerToast>[1];

const normalizeMessage = (message: ToastMessage): ToastMessage =>
    typeof message === 'string' ? message.replace(/\.\s*$/, '') : message;

const show = (
    type: 'success' | 'info' | 'warning' | 'error' | 'loading',
    message: ToastMessage,
    options?: ToastOptions,
): string | number => sonnerToast[type](normalizeMessage(message), options);

/** Toast del sistema: posición global en `Sonner.vue` y texto sin punto final. */
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
