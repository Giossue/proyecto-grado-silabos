import type { InjectionKey } from 'vue';

/** Sección de la tabla en la que se dibuja una fila. */
export type TableSection = 'header' | 'body' | 'footer';

/**
 * Solo las filas del cuerpo se convierten en tarjeta en pantalla estrecha: las de
 * encabezado y pie no describen un registro, así que no tienen detalle que abrir.
 * El valor por defecto es `header` a propósito —lo neutro— para que una fila suelta
 * fuera de `TableBody` no herede un comportamiento que nadie pidió.
 */
export const tableSectionKey: InjectionKey<TableSection> =
    Symbol('table-section');
