import { signal, type ReadonlySignal } from '@/lib/signal';

const open = signal(false);

export const templateEditorState = {
    open: open as ReadonlySignal<boolean>,
    setOpen(value: boolean): void {
        open.value = value;
    },
};
