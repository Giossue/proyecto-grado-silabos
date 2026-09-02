/** Solo dos temas: claro y oscuro. No se sigue la preferencia del sistema operativo. */
export type Appearance = 'light' | 'dark';
export type ResolvedAppearance = Appearance;

export type AppVariant = 'header' | 'sidebar';

export type FlashToast = {
    type: 'success' | 'info' | 'warning' | 'error';
    message: string;
};
