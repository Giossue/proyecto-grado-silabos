<?php

namespace App\Modules\Configuration\Application;

use App\Modules\Academic\Infrastructure\Persistence\Models\Faculty;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * Logos que encabezan el sílabo: el de la universidad (uno, reemplazable por
 * Administración) y el de cada facultad (obligatorio al crearla). Ambos son PNG sin
 * fondo con medidas fijas para que el encabezado salga siempre igual. Viven en el
 * disco privado y se sirven por ruta propia; el Word los lee del disco.
 */
class InstitutionalLogos
{
    public const DISK = 'private';

    /** @var array{width: int, height: int} */
    public const INSTITUTION = ['width' => 850, 'height' => 315];

    /** @var array{width: int, height: int} */
    public const FACULTY = ['width' => 600, 'height' => 180];

    private const INSTITUTION_PATH = 'logos/institucion.png';

    /**
     * Reglas de validación del archivo: PNG con transparencia y medida exacta.
     *
     * @param  array{width: int, height: int}  $size
     * @return list<mixed>
     */
    public static function rules(array $size): array
    {
        return [
            'file',
            'mimetypes:image/png',
            'max:1024',
            "dimensions:width={$size['width']},height={$size['height']}",
            new TransparentPng,
        ];
    }

    public function storeInstitution(UploadedFile $file): string
    {
        Storage::disk(self::DISK)->putFileAs(dirname(self::INSTITUTION_PATH), $file, basename(self::INSTITUTION_PATH));

        return self::INSTITUTION_PATH;
    }

    public function storeFaculty(Faculty $faculty, UploadedFile $file): string
    {
        $path = "logos/facultades/{$faculty->id}.png";
        Storage::disk(self::DISK)->putFileAs(dirname($path), $file, basename($path));
        $faculty->forceFill(['logo_ruta' => $path])->save();

        return $path;
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
