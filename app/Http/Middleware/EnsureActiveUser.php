<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class EnsureActiveUser
{
    /**
     * Revoke an existing session as soon as its account is deactivated.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user instanceof User && (! $user->activo || ! $user->isLaborallyEffective())) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            if ($request->expectsJson()) {
                abort(Response::HTTP_FORBIDDEN, 'La cuenta no está vigente.');
            }

            return redirect()->route('login')->withErrors([
                'correo_electronico' => 'La cuenta no está vigente. Solicite ayuda al administrador.',
            ]);
        }

        return $next($request);
    }
}
