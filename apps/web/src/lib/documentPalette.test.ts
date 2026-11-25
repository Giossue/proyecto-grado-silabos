import { describe, expect, it, vi } from 'vitest';
import { DOCUMENT_CELL_COLORS, DOCUMENT_TEXT_COLORS, paintCell } from '@/lib/documentPalette';

describe('paleta de celdas', () => {
  it('ofrece solo los colores de la tabla de identificación', () => {
    expect(DOCUMENT_CELL_COLORS.map((color) => [color.label, color.value])).toEqual([['Sin fondo', null], ['Celeste', '#C3D4EA'], ['Azul institucional', '#4F81BD']]);
  });

  it('el texto solo puede ser negro, azul o blanco', () => {
    expect(DOCUMENT_TEXT_COLORS.map((color) => [color.label, color.value])).toEqual([['Negro', '#000000'], ['Azul', '#365F91'], ['Blanco', '#FFFFFF']]);
  });

  it('cada color fija el fondo, el color del texto y la negrita de la celda', () => {
    const calls: Array<[string, unknown]> = [];
    const chain = { setCellAttribute: vi.fn((name: string, value: unknown) => { calls.push([name, value]); return chain; }) };

    paintCell(chain, DOCUMENT_CELL_COLORS[2]);

    expect(calls).toEqual([['backgroundColor', '#4F81BD'], ['textColor', '#FFFFFF'], ['bold', true]]);
  });
});
