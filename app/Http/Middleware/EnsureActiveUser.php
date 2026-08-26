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

        if ($user instanceof User && ! $user->active) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            if ($request->expectsJson()) {
                abort(Response::HTTP_FORBIDDEN, 'La cuenta está inactiva.');
            }

            return redirect()->route('login')->withErrors([
                'email' => 'La cuenta está inactiva. Solicite ayuda al administrador.',
            ]);
        }

        return $next($request);
    }
}
