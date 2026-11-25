import { afterEach, describe, expect, it } from 'vitest';
import { announcePage, clearPageHeading, setPageHeading, tabTitle } from '@/lib/pageAnnouncement';

describe('tabTitle', () => {
  it('pone primero el título de la página, luego el área y al final la aplicación', () => {
    expect(tabTitle('/admin/usuarios', 'Usuarios')).toBe('Usuarios · Admin · Sílabos UEB');
    expect(tabTitle('/ingresar', 'Iniciar sesión')).toBe('Iniciar sesión · Sílabos UEB');
  });

  it('sin título de página conserva el área y la aplicación', () => {
    expect(tabTitle('/docente')).toBe('Docente · Sílabos UEB');
    expect(tabTitle('/')).toBe('Sílabos UEB');
  });
});

describe('announcePage', () => {
  afterEach(() => clearPageHeading('Revisiones'));

  it('usa el título de la página visible al anunciar la navegación', () => {
    window.history.replaceState(null, '', '/coordinacion/revisiones');
    setPageHeading('Revisiones');
    expect(document.title).toBe('Revisiones · Coordinador · Sílabos UEB');
    announcePage('/coordinacion/revisiones?pagina=2', null);
    expect(document.title).toBe('Revisiones · Coordinador · Sílabos UEB');
  });

  it('al salir de la página vuelve al título del área', () => {
    window.history.replaceState(null, '', '/coordinacion/revisiones');
    setPageHeading('Revisiones');
    clearPageHeading('Revisiones');
    expect(document.title).toBe('Coordinador · Sílabos UEB');
  });
});
