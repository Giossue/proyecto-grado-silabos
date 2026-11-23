import { describe, expect, it } from 'vitest';
import { joinName, nameErrors, splitName } from '@/lib/personName';

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

  it('valida como el servidor: obligatorios, hasta 90 caracteres y solo letras, espacios, apóstrofo y guion', () => {
    expect(nameErrors({ nombres: 'MARÍA JOSÉ', apellidos: "DE LA CRUZ-O'NEIL" })).toEqual({});
    expect(nameErrors({ nombres: '  ', apellidos: '' })).toEqual({ nombres: ['Los nombres son obligatorios'], apellidos: ['Los apellidos son obligatorios'] });
    expect(nameErrors({ nombres: 'ANA 2', apellidos: 'PÉREZ' })).toEqual({ nombres: ['Los nombres solo admiten letras, espacios, apóstrofo y guion'] });
    expect(nameErrors({ nombres: 'ANA', apellidos: 'A'.repeat(91) })).toEqual({ apellidos: ['Los apellidos admiten hasta 90 caracteres'] });
  });
});
