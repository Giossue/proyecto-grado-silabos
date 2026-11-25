import { describe, expect, it } from 'vitest';
import { joinName, splitName } from '@/lib/personName';

describe('personName', () => {
  it('reparte un nombre guardado en nombres y apellidos y lo vuelve a unir igual', () => {
    const parts = splitName('ANA MARÍA PÉREZ LÓPEZ');

    expect(parts).toEqual({ nombres: 'ANA MARÍA', apellidos: 'PÉREZ LÓPEZ' });
    expect(joinName(parts)).toBe('ANA MARÍA PÉREZ LÓPEZ');
  });

  it('un apellido compuesto queda entero en los apellidos', () => {
    expect(splitName('JUAN CARLOS DE LA CRUZ MORA')).toEqual({ nombres: 'JUAN CARLOS', apellidos: 'DE LA CRUZ MORA' });
  });

  it('con tres palabras toma un nombre y dos apellidos; con dos, uno y uno', () => {
    expect(splitName('ANA PÉREZ LÓPEZ')).toEqual({ nombres: 'ANA', apellidos: 'PÉREZ LÓPEZ' });
    expect(splitName('ADMINISTRADOR DEMO')).toEqual({ nombres: 'ADMINISTRADOR', apellidos: 'DEMO' });
  });
});
