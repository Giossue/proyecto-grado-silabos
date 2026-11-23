import { pathOf } from '@/lib/routeTable';

export const APP_NAME = 'Sílabos UEB';
export const CONTENT_ID = 'contenido';

export const focusContent = (): void => {
    document.getElementById(CONTENT_ID)?.focus({ preventScroll: true });
};

const AREA_TITLES: Record<string, string> = { admin: 'Admin', coordinacion: 'Coordinador', docente: 'Docente', biblioteca: 'Biblioteca' };

export const tabTitle = (path: string): string => {
    const area = AREA_TITLES[path.split('/')[1] ?? ''];
    return area ? `${area} · ${APP_NAME}` : APP_NAME;
};

export const announcePage = (to: string, from: string | null): void => {
    document.title = tabTitle(pathOf(to));
    if (from === null || pathOf(to) === pathOf(from)) return;
    focusContent();
};
