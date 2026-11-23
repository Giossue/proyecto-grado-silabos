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

  it('«Mis sílabos» resalta la lista de tarjetas, no una tabla que no existe', () => {
    const selectors = (screenTours['/docente/mis-silabos'] ?? []).map((item) => item.selector);
    expect(selectors).toContain('ul[aria-label="Mis sílabos"]');
    expect(selectors).not.toContain('[data-slot="table-container"]');
  });
});
