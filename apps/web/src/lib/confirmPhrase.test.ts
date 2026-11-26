import { describe, expect, it } from 'vitest';
import { matchesPhrase } from '@/lib/confirmPhrase';

describe('frase de confirmación', () => {
  it('acepta la frase sin importar mayúsculas, tildes ni espacios de más', () => {
    expect(matchesPhrase('  Rehacer   silabos ', 'rehacer sílabos')).toBe(true);
    expect(matchesPhrase('CERRAR PERIODO', 'cerrar periodo')).toBe(true);
  });

  it('rechaza una frase incompleta o distinta', () => {
    expect(matchesPhrase('cerrar', 'cerrar periodo')).toBe(false);
    expect(matchesPhrase('', 'editar plantilla')).toBe(false);
  });
});
