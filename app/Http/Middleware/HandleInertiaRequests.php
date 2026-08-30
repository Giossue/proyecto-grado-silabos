<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Infrastructure\Persistence\Models\InternalNotification;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $user = $request->user();
        $activeRole = app(ActiveRole::class);
        $roles = $user instanceof User
            ? $activeRole->eligible($user)
                ->map(fn ($assignment) => [
                    'id' => $assignment->id,
                    'role' => $assignment->role->codigo,
                    'role_name' => $assignment->role->nombre,
                    'career_id' => $assignment->carrera_id,
                    'career_name' => $assignment->career?->nombre,
                ])
                ->values()
            : collect();
        // Resolver aquí activa el único ámbito no coordinador, si lo hay, antes de
        // compartir los props. Coordinación siempre confirma primero su carrera.
        $activeRoleId = $user instanceof User ? $activeRole->resolve($request)?->id : null;

        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'auth' => [
                'user' => $user,
                'roles' => $roles,
                'active_role_id' => is_string($activeRoleId) && $roles->contains('id', $activeRoleId)
                    ? $activeRoleId
                    : null,
            ],
            'flash' => [
                'success' => fn () => $request->session()->get('success'),
            ],
            'notifications' => [
                'unread_count' => $user instanceof User
                    ? InternalNotification::query()
                        ->where('usuario_id', $user->id)
                        ->whereNull('leido_en')
                        ->count()
                    : 0,
            ],
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
        ];
    }
}
