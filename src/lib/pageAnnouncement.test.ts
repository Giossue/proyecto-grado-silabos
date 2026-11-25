import { afterEach, describe, expect, it } from 'vitest';
import { announcePage, CONTENT_ID } from '@/lib/pageAnnouncement';

describe('announcePage', () => {
  afterEach(() => document.getElementById(CONTENT_ID)?.remove());

  const content = (): HTMLElement => {
    const element = document.createElement('main');
    element.id = CONTENT_ID;
    element.tabIndex = -1;
    document.body.append(element);
    return element;
  };

  it('al cambiar de página lleva el foco al contenido y no toca el título', () => {
    const main = content();
    document.title = 'Revisiones · Coordinador · Sílabos UEB';
    announcePage('/coordinacion/historial', '/coordinacion/revisiones');

    expect(document.activeElement).toBe(main);
    expect(document.title).toBe('Revisiones · Coordinador · Sílabos UEB');
  });

  it('en la misma página, o al entrar por primera vez, no mueve el foco', () => {
    content();
    announcePage('/coordinacion/revisiones?pagina=2', '/coordinacion/revisiones');
    announcePage('/coordinacion/revisiones', null);

    expect(document.activeElement).toBe(document.body);
  });
});
