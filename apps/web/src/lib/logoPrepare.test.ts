import { describe, expect, it } from 'vitest';
import { contentBounds, fitInside, hasTransparency, removeWhiteBackground } from '@/lib/logoPrepare';

const image = (rows: string[]): { data: Uint8ClampedArray; width: number; height: number } => {
  const height = rows.length;
  const width = rows[0]!.length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) => [...row].forEach((cell, x) => {
    const [r, g, b] = cell === '.' ? [255, 255, 255] : cell === 'o' ? [255, 255, 255] : [20, 40, 160];
    data.set([r, g, b, 255], (y * width + x) * 4);
  }));

  return { data, width, height };
};
const alphaAt = (picture: ReturnType<typeof image>, x: number, y: number): number => picture.data[(y * picture.width + x) * 4 + 3]!;

describe('preparación del logo', () => {
  it('quita el blanco que toca el borde y deja el logo', () => {
    const picture = image(['.......', '..###..', '..###..', '.......']);
    removeWhiteBackground(picture.data, picture.width, picture.height, 18);

    expect(alphaAt(picture, 0, 0)).toBe(0);
    expect(alphaAt(picture, 6, 3)).toBe(0);
    expect(alphaAt(picture, 3, 1)).toBe(255);
  });

  it('conserva el blanco encerrado por el propio logo', () => {
    const picture = image(['.........', '.#######.', '.#.....#.', '.#.....#.', '.#######.', '.........']);
    removeWhiteBackground(picture.data, picture.width, picture.height, 18);

    expect(alphaAt(picture, 0, 0)).toBe(0);
    expect(alphaAt(picture, 4, 2)).toBe(255);
  });

  it('recorta los márgenes vacíos', () => {
    const picture = image(['.......', '..###..', '..###..', '.......']);
    removeWhiteBackground(picture.data, picture.width, picture.height, 18);

    expect(contentBounds(picture.data, picture.width, picture.height)).toEqual({ left: 2, top: 1, right: 5, bottom: 3 });
  });

  it('no hay límites cuando todo es fondo', () => {
    const picture = image(['...', '...']);
    removeWhiteBackground(picture.data, picture.width, picture.height, 18);

    expect(contentBounds(picture.data, picture.width, picture.height)).toBeNull();
  });

  it('detecta si la imagen ya trae transparencia', () => {
    const opaque = image(['##', '##']);
    expect(hasTransparency(opaque.data)).toBe(false);
    opaque.data[3] = 0;
    expect(hasTransparency(opaque.data)).toBe(true);
  });

  it('ajusta sin deformar', () => {
    expect(fitInside({ width: 1200, height: 600 }, { width: 588, height: 168 })).toEqual({ width: 336, height: 168 });
    expect(fitInside({ width: 100, height: 20 }, { width: 588, height: 168 })).toEqual({ width: 588, height: 118 });
  });
});
