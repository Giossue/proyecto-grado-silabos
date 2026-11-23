import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearIntendedRoute,
  consumeIntendedRoute,
  isValidIntendedRoute,
  rememberIntendedRoute,
} from '@/lib/intended-route';

describe('ruta intended', () => {
  beforeEach(() => clearIntendedRoute());

  it('conserva rutas internas y las consume una sola vez', () => {
    rememberIntendedRoute('/coordinacion/revisiones/rev-1?tab=historial');

    expect(consumeIntendedRoute()).toBe('/coordinacion/revisiones/rev-1?tab=historial');
    expect(consumeIntendedRoute()).toBeNull();
  });

  it('rechaza destinos externos o públicos', () => {
    expect(isValidIntendedRoute('https://example.com')).toBe(false);
    expect(isValidIntendedRoute('//example.com')).toBe(false);
    expect(isValidIntendedRoute('/ingresar')).toBe(false);
    expect(isValidIntendedRoute('/admin/usuarios')).toBe(true);
    expect(isValidIntendedRoute('/ruta-desconocida')).toBe(false);
    expect(isValidIntendedRoute('/')).toBe(false);
    rememberIntendedRoute('/ruta-desconocida', false);
    expect(consumeIntendedRoute()).toBeNull();
  });
});
