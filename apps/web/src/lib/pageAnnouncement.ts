import { pathOf } from '@/lib/routeTable';

export const CONTENT_ID = 'contenido';

export const focusContent = (): void => {
    document.getElementById(CONTENT_ID)?.focus({ preventScroll: true });
};

export const announcePage = (to: string, from: string | null): void => {
    if (from === null || pathOf(to) === pathOf(from)) return;
    focusContent();
};
