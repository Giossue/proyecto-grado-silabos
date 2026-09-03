<?php

namespace App\Modules\Configuration\Application;

use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Logos que encabezan el sílabo: el de la universidad (uno, reemplazable por
 * Administración) y el de cada facultad (obligatorio al crearla). Ambos son PNG sin
 * fondo; el sistema los ajusta a una medida fija (conservando la proporción, centrados
 * sobre lienzo transparente) para que el encabezado salga siempre igual. Viven en el
 * disco privado y se sirven por ruta propia; el Word los lee del disco.
 */
class InstitutionalLogos
{
    public const DISK = 'private';

    /** @var array{width: positive-int, height: positive-int} */
    public const INSTITUTION = ['width' => 850, 'height' => 315];

    /** @var array{width: positive-int, height: positive-int} */
    public const FACULTY = ['width' => 600, 'height' => 180];

    private const INSTITUTION_PATH = 'logos/institucion.png';

    /**
     * Reglas de validación del archivo: PNG con transparencia. La medida no se exige
     * porque `fit()` la ajusta al guardar.
     *
     * @param  array{width: positive-int, height: positive-int}  $size
     * @return list<mixed>
     */
    public static function rules(array $size): array
    {
        return [
            'file',
            'mimetypes:image/png',
            'max:4096',
            new TransparentPng,
        ];
    }

    public function storeInstitution(UploadedFile $file): string
    {
        Storage::disk(self::DISK)->put(self::INSTITUTION_PATH, self::fit($file, self::INSTITUTION));

        return self::INSTITUTION_PATH;
    }

    public function storeFaculty(Faculty $faculty, UploadedFile $file): string
    {
        $path = "logos/facultades/{$faculty->id}.png";
        Storage::disk(self::DISK)->put($path, self::fit($file, self::FACULTY));
        $faculty->forceFill(['logo_ruta' => $path])->save();

        return $path;
    }

    /**
     * Ajusta el PNG a la medida: se escala conservando la proporción hasta caber y se
     * centra sobre un lienzo transparente del tamaño exacto. Devuelve los bytes PNG.
     *
     * @param  array{width: positive-int, height: positive-int}  $size
     */
    public static function fit(UploadedFile $file, array $size): string
    {
        $source = @imagecreatefrompng($file->getRealPath());
        if ($source === false) {
            throw ValidationException::withMessages(['logo' => 'No se pudo leer el PNG.']);
        }

        $sourceWidth = imagesx($source);
        $sourceHeight = imagesy($source);
        $scale = min($size['width'] / $sourceWidth, $size['height'] / $sourceHeight);
        $width = max(1, (int) round($sourceWidth * $scale));
        $height = max(1, (int) round($sourceHeight * $scale));

        $canvas = imagecreatetruecolor($size['width'], $size['height']);
        imagealphablending($canvas, false);
        imagesavealpha($canvas, true);
        imagefill($canvas, 0, 0, (int) imagecolorallocatealpha($canvas, 0, 0, 0, 127));
        imagealphablending($canvas, true);
        imagecopyresampled(
            $canvas,
            $source,
            intdiv($size['width'] - $width, 2),
            intdiv($size['height'] - $height, 2),
            0,
            0,
            $width,
            $height,
            $sourceWidth,
            $sourceHeight,
        );
        imagealphablending($canvas, false);
        imagesavealpha($canvas, true);

        ob_start();
        imagepng($canvas, null, 6);
        $png = ob_get_clean();
        imagedestroy($canvas);
        imagedestroy($source);

        if (! is_string($png) || $png === '') {
            throw ValidationException::withMessages(['logo' => 'No se pudo ajustar el logo.']);
        }

        return $png;
    }

    /** Ruta absoluta del logo de la universidad; el de fábrica si nadie subió uno. */
    public function institutionPath(): string
    {
        $disk = Storage::disk(self::DISK);

        return $disk->exists(self::INSTITUTION_PATH)
            ? $disk->path(self::INSTITUTION_PATH)
            : public_path('images/silabo/ueb.jpeg');
    }

    /** Ruta absoluta del logo de la facultad; el de fábrica si no tiene o no existe. */
    public function facultyPath(?Faculty $faculty): string
    {
        $disk = Storage::disk(self::DISK);
        $path = $faculty?->logo_ruta;

        return is_string($path) && $path !== '' && $disk->exists($path)
            ? $disk->path($path)
            : public_path('images/silabo/facultad.jpeg');
    }

    public function facultyPathById(?string $facultyId): string
    {
        return $this->facultyPath($facultyId === null ? null : Faculty::query()->find($facultyId));
    }

    /** Marca de versión para que el navegador no cachee un logo reemplazado. */
    public function version(string $absolutePath): string
    {
        $time = @filemtime($absolutePath);

        return $time === false ? '0' : (string) $time;
    }
}
