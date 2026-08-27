<?php

namespace App\Modules\Identity\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Identity\Application\Actions\AssignRole;
use App\Modules\Identity\Application\Actions\CreateManagedUser;
use App\Modules\Identity\Application\Actions\SetUserStatus;
use App\Modules\Identity\Application\Actions\UpdateManagedUserProfile;
use App\Modules\Identity\Infrastructure\Persistence\Models\Role;
use App\Modules\Identity\Presentation\Http\Requests\AssignRoleRequest;
use App\Modules\Identity\Presentation\Http\Requests\CreateManagedUserRequest;
use App\Modules\Identity\Presentation\Http\Requests\IndexUsersRequest;
use App\Modules\Identity\Presentation\Http\Requests\SetUserStatusRequest;
use App\Modules\Identity\Presentation\Http\Requests\ShowManagedUserRequest;
use App\Modules\Identity\Presentation\Http\Requests\UpdateManagedUserProfileRequest;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class ManagedUserController extends Controller
{
    public function index(IndexUsersRequest $request): Response
    {
        $filters = $request->validated();
        $search = is_string($filters['q'] ?? null) ? trim($filters['q']) : null;
        $status = in_array($filters['status'] ?? null, ['active', 'inactive'], true)
            ? $filters['status']
            : null;
        $users = User::query()
            ->select(['id', 'name', 'email', 'active', 'created_at'])
            ->when($search, fn (Builder $query, string $term) => $query->where(
                fn (Builder $searchQuery) => $searchQuery
                    ->whereRaw('name ILIKE ?', ["%{$term}%"])
                    ->orWhereRaw('email ILIKE ?', ["%{$term}%"]),
            ))
            ->when($status, fn (Builder $query, string $value) => $query->where('active', $value === 'active'))
            ->with(['roleAssignments' => fn ($query) => $query
                ->effective()
                ->with(['role:id,codigo,nombre', 'career:id,nombre'])])
            ->orderBy('name')
            ->paginate(20)
            ->withQueryString()
            ->through(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'active' => $user->active,
                'roles' => $user->roleAssignments->map(fn ($assignment) => [
                    'name' => $assignment->role->nombre,
                    'career_name' => $assignment->career?->nombre,
                ])->values(),
            ]);

        return Inertia::render('Admin/Users/Index', [
            'users' => $users,
            'filters' => ['q' => $search, 'status' => $status],
            'roles' => Role::query()->orderBy('nombre')->get(['codigo', 'nombre']),
            'careers' => Career::query()->where('activo', true)->orderBy('nombre')->get(['id', 'nombre']),
            'today' => now()->setTimezone(config('app.display_timezone'))->toDateString(),
        ]);
    }

    public function store(CreateManagedUserRequest $request, CreateManagedUser $action): RedirectResponse
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute([
            'name' => $request->string('name')->toString(),
            'email' => $request->string('email')->toString(),
            'password' => $request->string('password')->toString(),
            'role_code' => $request->string('role_code')->toString(),
            'career_id' => $request->filled('career_id') ? $request->string('career_id')->toString() : null,
        ], $actor, $request);

        return back()->with('success', 'Cuenta creada con su rol inicial.');
    }

    public function show(User $user, ShowManagedUserRequest $request): Response
    {
        $user->load(['roleAssignments' => fn ($query) => $query
            ->with(['role:id,codigo,nombre', 'career:id,nombre'])
            ->orderByDesc('vigente_desde')]);

        return Inertia::render('Admin/Users/Show', [
            'managedUser' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'active' => $user->active,
                'assignments' => $user->roleAssignments->map(fn ($assignment) => [
                    'id' => $assignment->id,
                    'role_name' => $assignment->role->nombre,
                    'career_name' => $assignment->career?->nombre,
                    'valid_from' => $assignment->vigente_desde->toDateString(),
                    'valid_until' => $assignment->vigente_hasta?->toDateString(),
                    'active' => $assignment->activo,
                    'effective' => $assignment->activo
                        && $assignment->vigente_desde->isPast()
                        && ($assignment->vigente_hasta === null || $assignment->vigente_hasta->isFuture()),
                ])->values(),
            ],
            'roles' => Role::query()->orderBy('nombre')->get(['codigo', 'nombre']),
            'careers' => Career::query()->where('activo', true)->orderBy('nombre')->get(['id', 'nombre']),
        ]);
    }

    public function assignRole(User $user, AssignRoleRequest $request, AssignRole $action): RedirectResponse
    {
        Gate::authorize('update', $user);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($user, [
            'role_code' => $request->string('role_code')->toString(),
            'career_id' => $request->filled('career_id') ? $request->string('career_id')->toString() : null,
            'valid_from' => $request->string('valid_from')->toString(),
            'valid_until' => $request->filled('valid_until') ? $request->string('valid_until')->toString() : null,
        ], $actor, $request);

        return back()->with('success', 'Rol asignado con su alcance y vigencia.');
    }

    public function setStatus(User $user, SetUserStatusRequest $request, SetUserStatus $action): RedirectResponse
    {
        Gate::authorize('update', $user);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($user, $request->boolean('active'), $actor, $request);

        return back()->with('success', $user->active ? 'Cuenta activada.' : 'Cuenta desactivada y sesiones revocadas.');
    }

    public function updateProfile(
        User $user,
        UpdateManagedUserProfileRequest $request,
        UpdateManagedUserProfile $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($user, $request->profileData(), $actor, $request);

        return back()->with('success', 'Datos de la cuenta actualizados.');
    }
}
