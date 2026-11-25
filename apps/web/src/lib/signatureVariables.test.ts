import { describe, expect, it } from 'vitest';
import { isSignatureVariable, signatureLabel } from '@/lib/signatureVariables';

describe('variables de firma', () => {
  it('reconoce las firmas por su prefijo', () => {
    expect(isSignatureVariable('firma_docente')).toBe(true);
    expect(isSignatureVariable('nombre_carrera')).toBe(false);
  });

  it('toma la etiqueta del valor resuelto y, si falta, usa la del rol', () => {
    expect(signatureLabel('firma_docente', '\n\n\n\nFirma del docente')).toBe('Firma del docente');
    expect(signatureLabel('firma_coordinador', '')).toBe('Firma de coordinación');
    expect(signatureLabel('firma_bibliotecario')).toBe('Firma de biblioteca');
    expect(signatureLabel('firma_otra')).toBe('');
  });
});
