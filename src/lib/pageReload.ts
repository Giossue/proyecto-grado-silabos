/** Recargas de página aisladas para poder probarlas (jsdom no deja reemplazar window.location). */
export const reloadPage = (): void => window.location.reload();
export const navigateTo = (url: string): void => window.location.assign(url);
