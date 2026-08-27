import type { InjectionKey, Ref } from 'vue';
import { inject, ref } from 'vue';
import type { BreadcrumbItem } from '@/types';

export const breadcrumbsKey: InjectionKey<Ref<BreadcrumbItem[]>> =
    Symbol('breadcrumbs');

/** Nombre de la pantalla abierta. Lo pone el marco de la página; lo lee el encabezado. */
export const pageTitleKey: InjectionKey<Ref<string>> = Symbol('page-title');

const EMPTY = ref<BreadcrumbItem[]>([]);
const NO_TITLE = ref('');

/**
 * El nombre de la pantalla se dice una sola vez, y se dice arriba.
 *
 * Antes aparecía dos veces: en la miga del encabezado y otra vez como título, dos
 * centímetros más abajo. Ahora la pantalla se lo entrega al encabezado y no lo dibuja.
 * Donde la miga ya lo decía —«Procesos» sobre «Procesos»— el encabezado no lo repite;
 * donde decía otra cosa —«Usuarios» sobre el nombre de una persona— lo añade al final.
 */
export function usePageBreadcrumbs(): Ref<BreadcrumbItem[]> {
    return inject(breadcrumbsKey, EMPTY);
}

export function usePageTitle(): Ref<string> {
    return inject(pageTitleKey, NO_TITLE);
}

/** Compara sin distinguir mayúsculas ni tildes. */
export function saysTheSame(one: string, other: string): boolean {
    const clean = (value: string): string =>
        value
            .toLocaleLowerCase('es')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .trim();

    const a = clean(one);
    const b = clean(other);

    return a !== '' && b !== '' && (a.includes(b) || b.includes(a));
}
