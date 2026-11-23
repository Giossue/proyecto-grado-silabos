import { describe, expect, it } from 'vitest';
import { attemptKey } from '@/lib/attemptKey';

describe('attemptKey', () => {
  it('reutiliza la clave en los reintentos del mismo envío', () => {
    const key = attemptKey();
    expect(key.use('a')).toBe(key.use('a'));
  });

  it('cambia la clave cuando cambia lo que se envía o después de un éxito', () => {
    const key = attemptKey();
    const first = key.use('a');
    expect(key.use('b')).not.toBe(first);
    const second = key.use('b');
    key.reset();
    expect(key.use('b')).not.toBe(second);
  });
});
