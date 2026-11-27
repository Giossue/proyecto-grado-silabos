import { describe, expect, it } from 'vitest';
import { screenTours } from '@/lib/screenTours';

describe('screenTours', () => {
  it('perfil, seguridad y avisos tienen guía en todos los roles', () => {
    for (const role of ['admin', 'coordinacion', 'docente', 'biblioteca']) {
      for (const screen of ['configuracion/perfil', 'configuracion/seguridad', 'notificaciones']) {
        expect(screenTours[`/${role}/${screen}`]?.length, `/${role}/${screen}`).toBeGreaterThan(0);
      }
    }
    expect(screenTours['/docente/configuracion/notificaciones']?.[0]?.selector).toBe('[data-tour="email-notices"]');
  });

  it('el editor del sílabo del docente tiene su propia guía, que termina en «Enviar»', () => {
    const steps = screenTours['/docente/mis-silabos/:syllabus'] ?? [];
    expect(steps.map((item) => item.title)).toContain('Enviar');
    expect(steps.at(-1)?.selector).toBe('[data-tour="syllabus-submit"]');
  });

  it('la guía del sílabo del docente señala «Asistente IA» después de «Vista previa»', () => {
    const steps = screenTours['/docente/mis-silabos/:syllabus'] ?? [];
    expect(steps.map((item) => item.title)).toEqual(['Plazo', 'Correcciones', 'Secciones', 'Su parte', 'Vista previa', 'Asistente IA', 'Enviar']);
    expect(steps.find((item) => item.title === 'Asistente IA')).toMatchObject({ selector: '[aria-label="Asistente IA"]', description: 'Pida ideas para sus textos. Usted decide cuáles usar' });
  });

  it('la guía de la plantilla señala el menú «Más» del editor, no «Opciones avanzadas»', () => {
    const steps = screenTours['/admin/plantilla'] ?? [];
    expect(steps.map((item) => item.selector)).not.toContain('[aria-label="Opciones avanzadas"]');
    expect(steps.find((item) => item.selector === '[data-tour="template-more"]')).toMatchObject({ title: 'Más', description: 'Editar JSON: descargue la plantilla o reemplácela con un archivo' });
  });

  it('«Mis sílabos» resalta la lista de tarjetas, no una tabla que no existe', () => {
    const selectors = (screenTours['/docente/mis-silabos'] ?? []).map((item) => item.selector);
    expect(selectors).toContain('ul[aria-label="Mis sílabos"]');
    expect(selectors).not.toContain('[data-slot="table-container"]');
  });

  it('la guía de la plantilla habla de quién llena el campo, no de si se puede editar', () => {
    const selection = (screenTours['/admin/plantilla'] ?? []).find((item) => item.selector === '[data-tour="template-selection"]');
    expect(selection?.description).toBe('Pulse un campo de la hoja y aquí elige quién lo llena, lo mueve o lo borra');
  });
});
