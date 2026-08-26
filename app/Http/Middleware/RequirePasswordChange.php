<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequirePasswordChange
{
    /**
     * Rutas que siguen abiertas mientras la contraseña temporal esté vigente: la
     * superficie donde aparece el diálogo, el cambio en sí y la salida. Sin la última,
     * quien abriera la cuenta por error quedaría encerrado en ella.
     *
     * @var list<string>
     */
    private const ALLOWED_ROUTES = [
        'dashboard',
        'user-password.update',
        'logout',
    ];

    /**
     * El bloqueo vive en el servidor y no en el diálogo: una pantalla que solo existe en
     * el navegador se esquiva recargando o escribiendo la URL a mano.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user instanceof User || ! $user->must_change_password) {
            return $next($request);
        }

        $name = $request->route()?->getName();

        if (is_string($name) && in_array($name, self::ALLOWED_ROUTES, true)) {
            return $next($request);
        }

        if ($request->expectsJson() && ! $request->header('X-Inertia')) {
            abort(Response::HTTP_FORBIDDEN, 'Cambie la contraseña temporal antes de continuar.');
        }

        return redirect()->route('dashboard');
    }
}
