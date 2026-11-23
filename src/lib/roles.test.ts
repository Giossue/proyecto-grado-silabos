import { describe, expect, it } from 'vitest';
import { roleLabel, roleNeedsCareer, scopeTitle } from '@/lib/roles';

describe('roles', () => {
  it('nombra los cuatro roles y conserva un código desconocido', () => {
    expect(roleLabel('bibliotecario')).toBe('Bibliotecario');
    expect(roleLabel('administrador')).toBe('Administrador');
    expect(roleLabel('rol_futuro')).toBe('rol_futuro');
  });

  it('solo coordinación y docencia piden carrera', () => {
    expect(roleNeedsCareer('docente')).toBe(true);
    expect(roleNeedsCareer('coordinador')).toBe(true);
    expect(roleNeedsCareer('administrador')).toBe(false);
    expect(roleNeedsCareer('bibliotecario')).toBe(false);
  });

  it('describe el ámbito sin suponer que sin carrera es Administración', () => {
    expect(scopeTitle({ code: 'bibliotecario', career_name: null })).toBe('Biblioteca · toda la universidad');
    expect(scopeTitle({ code: 'administrador', career_name: null })).toBe('Administrador');
    expect(scopeTitle({ code: 'docente', career_name: 'Software' })).toBe('Docente · Software');
    expect(scopeTitle({ code: 'coordinador', career_name: 'Software' })).toBe('Software');
  });
});
