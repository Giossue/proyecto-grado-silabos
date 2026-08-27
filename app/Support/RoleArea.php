<?php

namespace App\Support;

use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use Illuminate\Http\RedirectResponse;
use Symfony\Component\HttpFoundation\Response;

/**
 * El área de trabajo que encabeza cada dirección.
 *
 * Toda pantalla vive bajo el segmento del rol desde el que se trabaja: `admin`,
 * `coordinacion` o `docente`. Una pantalla que sirve a más de un rol se registra una vez
 * por área, y la dirección corta —la que usan los enlaces— redirige a la del rol activo.
 * Así el enlace se escribe una sola vez y la barra de direcciones siempre dice desde
 * dónde se está mirando.
 */
final class RoleArea
{
    public const ADMIN = 'admin';

    public const COORDINATION = 'coordinacion';

    public const TEACHER = 'docente';

    /** Área del rol activo, o `null` mientras no se haya elegido rol. */
    public static function current(): ?string
    {
        $code = app(ActiveRole::class)->resolve(request())?->role->codigo;

        return match ($code) {
            RoleCode::Administrator->value => self::ADMIN,
            RoleCode::Coordinator->value => self::COORDINATION,
            RoleCode::Teacher->value => self::TEACHER,
            default => null,
        };
    }

    /**
     * Prefijo con el que se nombran las rutas del área.
     *
     * El segmento de la dirección va en español y el nombre de la ruta en inglés, como el
     * resto del código. Son dos cosas distintas: una la lee quien usa el sistema y la otra
     * quien lo programa.
     */
    public static function routePrefix(): ?string
    {
        return match (self::current()) {
            self::ADMIN => 'admin',
            self::COORDINATION => 'coordination',
            self::TEACHER => 'teacher',
            default => null,
        };
    }

    /**
     * Lleva a la copia de la pantalla que corresponde al rol activo.
     *
     * @param  array<string, string>  $parameters
     */
    public static function redirect(string $name, array $parameters = []): RedirectResponse
    {
        $prefix = self::routePrefix();

        // Sin rol elegido no hay área a la que llevar; sin copia para ese rol, la pantalla
        // no es suya. En ambos casos se responde lo mismo: no es asunto de quien pregunta.
        abort_if($prefix === null, Response::HTTP_FORBIDDEN);
        abort_unless(app('router')->has("{$prefix}.{$name}"), Response::HTTP_FORBIDDEN);

        return redirect()->route("{$prefix}.{$name}", $parameters);
    }
}
