import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { screenTours } from '@/lib/screenTours';

const sources = Object.entries(import.meta.glob<string>('../**/*.tsx', { query: '?raw', import: 'default', eager: true }))
  .filter(([path]) => !path.includes('.test.'))
  .map(([, text]) => text)
  .join('\n');

const helpScreenKeys = (): string[] => Object.keys(JSON.parse(readFileSync(join(process.cwd(), '../api/src/server/operations/screenHelpCatalog.json'), 'utf8')) as object);

const stepOf = (screen: string, selector: string) => (screenTours[screen] ?? []).find((item) => item.selector === selector);

describe('screenTours', () => {
  it('toda pantalla con ayuda tiene pasos que señalan dónde pulsar', () => {
    const screens = helpScreenKeys();

    expect(screens.length).toBeGreaterThan(40);
    expect(screens.filter((screen) => !screenTours[screen]?.length)).toEqual([]);
  });

  it('cada marca «data-tour» que busca una guía existe en alguna pantalla', () => {
    const wanted = Object.values(screenTours).flatMap((steps) => steps.flatMap((item) => [...item.selector.matchAll(/data-tour="([a-z-]+)"/g)].map((match) => match[1]!)));

    expect([...new Set(wanted)].filter((name) => !new RegExp(`(data-tour|tour)["']?[=:] ?["'{]*["']?${name}["']`).test(sources))).toEqual([]);
  });

  it('en el proyecto de una materia se explica cómo decidir qué responde el docente', () => {
    for (const screen of ['/coordinacion/proyecto-carrera/:malla/:subject', '/admin/carreras/:career/proyecto-carrera/:malla/:subject']) {
      expect(stepOf(screen, '[aria-label="Configurar campo"]')?.description, screen).toContain('«Elegir varias»');
      expect(screenTours[screen]?.at(-1)?.title, screen).toBe('Guardar información');
    }
  });

  it('en el proyecto de una carrera visto por Administración no se habla de documentos de apoyo', () => {
    expect(JSON.stringify(screenTours['/admin/carreras/:career/proyecto-carrera'])).not.toContain('apoyo');
  });

  it('el paso del Excel avisa que lo que quitaría la respuesta del docente viene sin marcar', () => {
    for (const screen of ['/coordinacion/proyecto-carrera', '/admin/carreras/:career/proyecto-carrera']) {
      expect(stepOf(screen, '[data-tour="page-actions"]')?.description, screen).toContain('Antes de aplicar, revise los cambios: lo que quitaría la respuesta del docente viene sin marcar');
    }
  });

  it('en «Sistema» se señala el interruptor del asistente del docente', () => {
    expect(stepOf('/admin/configuracion/sistema', '[data-tour="settings-teacher-ai"]')?.description).toContain('Empieza apagado');
  });

  it('en la plantilla se explican «Vista previa», «Ver como docente» y lo que lee la IA', () => {
    expect(stepOf('/admin/plantilla', '[data-tour="template-preview"]')?.title).toBe('Vista previa');
    expect(stepOf('/admin/plantilla', '[data-tour="template-teacher-view"]')?.title).toBe('Ver como docente');
    expect(stepOf('/admin/plantilla', '[data-tour="template-selection"]')?.description).toContain('si la IA puede leerlo');
  });

  it('el docente ve en la guía cómo elegir opciones y el aviso sobre la IA externa', () => {
    expect(stepOf('/docente/mis-silabos/:syllabus', '.teacher-form')?.description).toContain('«Elegir varias»');
    expect(stepOf('/docente/mis-silabos/:syllabus', '[data-tour="teacher-assistant"]')?.description).toMatch(/DeepSeek.*no escriba datos personales/);
  });

  it('el paso de accesibilidad abre hacia la derecha, porque su botón está abajo a la izquierda', () => {
    expect(stepOf('/docente/mis-silabos', '[aria-label="Accesibilidad"]')?.side).toBe('right');
  });

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

  it('la guía del sílabo del docente señala el botón flotante «Asistente» después de «Vista previa»', () => {
    const steps = screenTours['/docente/mis-silabos/:syllabus'] ?? [];
    expect(steps.map((item) => item.title)).toEqual(['Plazo', 'Correcciones', 'Secciones', 'Su parte', 'Documentos de apoyo', 'Vista previa', 'Asistente', 'Enviar']);
    expect(steps.find((item) => item.title === 'Asistente')).toMatchObject({ selector: '[data-tour="teacher-assistant"]', side: 'left' });
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

  it.each([
    ['/coordinacion/malla', 'Elija qué malla ver o cambiar. Al final de la lista puede crear otra'],
    ['/coordinacion/materias-asignaciones', 'Se ve una malla a la vez. Elija aquí cuál'],
    ['/coordinacion/proyecto-carrera', 'En «Materias» se ve una malla a la vez. Elija aquí cuál'],
  ])('la guía de %s señala el desplegable de malla', (screen, description) => {
    const found = (screenTours[screen] ?? []).filter((item) => item.selector === '[data-tour="malla-selector"]');
    expect(found).toEqual([expect.objectContaining({ title: 'Malla', description })]);
  });

  it('la guía de «Materias y asignaciones» empieza por la malla y conserva sus demás pasos', () => {
    expect((screenTours['/coordinacion/materias-asignaciones'] ?? []).map((item) => item.title)).toEqual(['Malla', 'Buscar', 'Materias', 'Para lo marcado']);
  });

  it('la guía de la plantilla habla de quién llena el campo, no de si se puede editar', () => {
    const selection = (screenTours['/admin/plantilla'] ?? []).find((item) => item.selector === '[data-tour="template-selection"]');
    expect(selection?.description).toContain('quién lo llena');
    expect(selection?.description).not.toMatch(/puede editar/);
  });
});
