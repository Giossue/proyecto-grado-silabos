export const LOGO_SIZE = { width: 600, height: 180, margin: 6 } as const;

const WORK_BOX = { width: LOGO_SIZE.width * 2, height: LOGO_SIZE.height * 2 };
const SOFT_EDGE = 24;

export type Bounds = { left: number; top: number; right: number; bottom: number };

/** Distancia al blanco de un píxel: 0 es blanco puro, 255 es negro. */
const distanceToWhite = (data: Uint8ClampedArray, offset: number): number =>
    255 - Math.min(data[offset]!, data[offset + 1]!, data[offset + 2]!);

/** ¿La imagen ya trae partes transparentes? Si es así no hace falta quitar el fondo. */
export function hasTransparency(data: Uint8ClampedArray): boolean {
    for (let index = 3; index < data.length; index += 4) {
        if (data[index]! < 250) return true;
    }

    return false;
}

/**
 * Vuelve transparente el blanco que toca los bordes de la imagen. El blanco encerrado por el
 * propio logo (por ejemplo, el relleno de una letra) se conserva. `tolerance` va de 0 a 80.
 */
export function removeWhiteBackground(data: Uint8ClampedArray, width: number, height: number, tolerance: number): void {
    const visited = new Uint8Array(width * height);
    const stack: number[] = [];
    const push = (x: number, y: number): void => {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const position = y * width + x;
        if (visited[position] === 1) return;
        const alpha = data[position * 4 + 3]!;
        if (alpha > 0 && distanceToWhite(data, position * 4) > tolerance) return;
        visited[position] = 1;
        stack.push(position);
    };
    for (let x = 0; x < width; x++) {
        push(x, 0);
        push(x, height - 1);
    }
    for (let y = 0; y < height; y++) {
        push(0, y);
        push(width - 1, y);
    }
    while (stack.length > 0) {
        const position = stack.pop()!;
        const x = position % width;
        const y = (position - x) / width;
        data[position * 4 + 3] = 0;
        push(x + 1, y);
        push(x - 1, y);
        push(x, y + 1);
        push(x, y - 1);
    }
    // Borde suave: los píxeles claros pegados al fondo quitado quedan semitransparentes, sin halo blanco.
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const position = y * width + x;
            if (visited[position] === 1) continue;
            const touchesBackground = (x > 0 && visited[position - 1] === 1) || (x < width - 1 && visited[position + 1] === 1)
                || (y > 0 && visited[position - width] === 1) || (y < height - 1 && visited[position + width] === 1);
            if (!touchesBackground) continue;
            const distance = distanceToWhite(data, position * 4);
            if (distance < tolerance + SOFT_EDGE) {
                const keep = Math.max(0, (distance - tolerance) / SOFT_EDGE);
                data[position * 4 + 3] = Math.round(data[position * 4 + 3]! * keep);
            }
        }
    }
}

/** Rectángulo mínimo que contiene lo visible; null si no queda nada. */
export function contentBounds(data: Uint8ClampedArray, width: number, height: number): Bounds | null {
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3]! <= 10) continue;
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
        }
    }

    return right < 0 ? null : { left, top, right: right + 1, bottom: bottom + 1 };
}

/** Tamaño con el que cabe `source` dentro de `box` sin deformarse. */
export function fitInside(source: { width: number; height: number }, box: { width: number; height: number }): { width: number; height: number } {
    const scale = Math.min(box.width / source.width, box.height / source.height);

    return { width: Math.max(1, Math.round(source.width * scale)), height: Math.max(1, Math.round(source.height * scale)) };
}

export type PrepareOptions = { removeWhite: boolean; tolerance: number };

const loadImage = (file: File): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
    };
    image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudo leer la imagen'));
    };
    image.src = url;
});

const canvasOf = (width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context === null) throw new Error('No se pudo preparar la imagen');
    context.imageSmoothingQuality = 'high';

    return [canvas, context];
};

export type LoadedLogo = { image: HTMLImageElement; transparent: boolean };

export async function loadLogo(file: File): Promise<LoadedLogo> {
    const image = await loadImage(file);
    const size = fitInside({ width: image.naturalWidth, height: image.naturalHeight }, { width: 200, height: 200 });
    const [, context] = canvasOf(size.width, size.height);
    context.drawImage(image, 0, 0, size.width, size.height);

    return { image, transparent: hasTransparency(context.getImageData(0, 0, size.width, size.height).data) };
}

/** Deja el logo en un PNG de 600 × 180 con fondo transparente, recortado y centrado. */
export async function prepareLogo(logo: LoadedLogo, options: PrepareOptions): Promise<File> {
    const work = fitInside({ width: logo.image.naturalWidth, height: logo.image.naturalHeight }, WORK_BOX);
    const [workCanvas, workContext] = canvasOf(work.width, work.height);
    workContext.drawImage(logo.image, 0, 0, work.width, work.height);
    const pixels = workContext.getImageData(0, 0, work.width, work.height);
    if (options.removeWhite) removeWhiteBackground(pixels.data, work.width, work.height, options.tolerance);
    const bounds = contentBounds(pixels.data, work.width, work.height);
    if (bounds === null) throw new Error('El logo quedó vacío: baje la intensidad o desactive «Quitar el fondo blanco»');
    workContext.putImageData(pixels, 0, 0);
    const cropped = { width: bounds.right - bounds.left, height: bounds.bottom - bounds.top };
    const target = fitInside(cropped, { width: LOGO_SIZE.width - LOGO_SIZE.margin * 2, height: LOGO_SIZE.height - LOGO_SIZE.margin * 2 });
    const [finalCanvas, finalContext] = canvasOf(LOGO_SIZE.width, LOGO_SIZE.height);
    finalContext.drawImage(
        workCanvas, bounds.left, bounds.top, cropped.width, cropped.height,
        Math.round((LOGO_SIZE.width - target.width) / 2), Math.round((LOGO_SIZE.height - target.height) / 2), target.width, target.height,
    );
    const blob = await new Promise<Blob | null>((resolve) => finalCanvas.toBlob(resolve, 'image/png'));
    if (blob === null) throw new Error('No se pudo preparar la imagen');

    return new File([blob], 'logo.png', { type: 'image/png' });
}
