import { describe, expect, it } from 'vitest';
import { relativeTime } from '@/lib/relativeTime';

const now = new Date('2026-09-23T12:00:00-05:00');
const ago = (ms: number): string => new Date(now.getTime() - ms).toISOString();

describe('antigüedad relativa', () => {
  it('resume el tiempo transcurrido en la unidad más cercana', () => {
    expect(relativeTime(ago(20_000), now)).toBe('ahora');
    expect(relativeTime(ago(5 * 60_000), now)).toBe('hace 5 min');
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe('hace 3 h');
    expect(relativeTime(ago(26 * 3_600_000), now)).toBe('hace 1 día');
    expect(relativeTime(ago(4 * 86_400_000), now)).toBe('hace 4 días');
    expect(relativeTime(ago(15 * 86_400_000), now)).toBe('hace 2 sem');
  });

  it('muestra la fecha cuando el aviso es antiguo', () => {
    expect(relativeTime('2026-03-12T12:00:00-05:00', now)).toMatch(/12.*mar/);
    expect(relativeTime('2025-03-12T12:00:00-05:00', now)).toMatch(/2025/);
  });
});
