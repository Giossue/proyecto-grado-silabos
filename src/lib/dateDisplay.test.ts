import { describe, expect, it } from 'vitest';
import { formatDateDisplay } from '@/lib/dateDisplay';

describe('formatDateDisplay', () => {
    it('conserva la fecha de los períodos sin desplazarla al día anterior', () => {
        expect(formatDateDisplay('2026-09-29', { day: '2-digit', month: '2-digit', year: 'numeric' })).toBe('29/09/2026');
    });

    it('presenta los instantes UTC en la zona horaria institucional', () => {
        expect(formatDateDisplay('2026-09-29T02:00:00Z', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })).toBe('28/09/2026, 21:00');
    });
});
