import { signal, type ReadonlySignal } from '@/lib/signal';

const open = signal(false);

export const curriculumEditorState = {
  open: open as ReadonlySignal<boolean>,
  setOpen(value: boolean): void {
    open.value = value;
  },
};
