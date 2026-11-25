import { useEffect } from 'react';
import { pathOf } from '@/lib/routeTable';

export const APP_NAME = 'Sílabos UEB';
export const CONTENT_ID = 'contenido';

export const focusContent = (): void => {
    document.getElementById(CONTENT_ID)?.focus({ preventScroll: true });
};

const AREA_TITLES: Record<string, string> = { admin: 'Admin', coordinacion: 'Coordinador', docente: 'Docente', biblioteca: 'Biblioteca' };

let pageHeading = '';

export const tabTitle = (path: string, heading = ''): string => {
    const area = AREA_TITLES[path.split('/')[1] ?? ''];
    return [heading.trim(), area, APP_NAME].filter(Boolean).join(' · ');
};

export const setPageHeading = (heading: string): void => {
    pageHeading = heading;
    document.title = tabTitle(pathOf(window.location.pathname), heading);
};

export const clearPageHeading = (heading: string): void => {
    if (pageHeading === heading) setPageHeading('');
};

export const usePageHeading = (heading: string): void => {
    useEffect(() => {
        setPageHeading(heading);
        return () => clearPageHeading(heading);
    }, [heading]);
};

export const announcePage = (to: string, from: string | null): void => {
    document.title = tabTitle(pathOf(to), pageHeading);
    if (from === null || pathOf(to) === pathOf(from)) return;
    focusContent();
};
