import { describe, expect, it } from 'vitest';
import { nextParallelCode } from '@/lib/parallelCodes';

describe('nextParallelCode', () => {
    it('empieza en A y toma la primera letra libre', () => {
        expect(nextParallelCode([])).toBe('A');
        expect(nextParallelCode([{ code: 'A' }, { code: 'c' }])).toBe('B');
        expect(nextParallelCode([{ code: ' a ' }, { code: 'B' }])).toBe('C');
    });
});
