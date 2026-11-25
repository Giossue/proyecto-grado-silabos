import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadJson } from '@/lib/downloadJson';

describe('downloadJson', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        URL.createObjectURL = vi.fn(() => 'blob:json');
        URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('descarga el archivo y libera la URL después del clic', () => {
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

        downloadJson('{"a":1}', 'plantilla.json');

        expect(click).toHaveBeenCalledTimes(1);
        const link = click.mock.contexts[0] as HTMLAnchorElement;
        expect(link.download).toBe('plantilla.json');
        expect(link.href).toBe('blob:json');
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();

        vi.runAllTimers();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:json');
        click.mockRestore();
    });
});
