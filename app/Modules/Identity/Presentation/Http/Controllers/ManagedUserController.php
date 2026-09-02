<?php

namespace App\Modules\Identity\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Identity\Application\Actions\AssignRole;
use App\Modules\Identity\Application\Actions\CreateManagedUser;
use App\Modules\Identity\Application\Actions\SetUserStatus;
use App\Modules\Identity\Application\Actions\UpdateManagedUserProfile;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\Role;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Identity\Presentation\Http\Requests\AssignRoleRequest;
use App\Modules\Identity\Presentation\Http\Requests\CreateManagedUserRequest;
use App\Modules\Identity\Presentation\Http\Requests\IndexUsersRequest;
use App\Modules\Identity\Presentation\Http\Requests\SetUserStatusRequest;
use App\Modules\Identity\Presentation\Http\Requests\ShowManagedUserRequest;
use App\Modules\Identity\Presentation\Http\Requests\UpdateManagedUserProfileRequest;
use App\Modules\Identity\Presentation\Http\Requests\UpdateManagedUserRequest;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class ManagedUserController extends Controller
{
    public function index(IndexUsersRequest $request): Response
    {
        $filters = $request->validated();
        $search = is_string($filters['q'] ?? null) ? trim($filters['q']) : null;
        $status = in_array($filters['status'] ?? null, ['active', 'pending', 'inactive'], true)
            ? $filters['status']
            : null;
        $role = in_array($filters['role'] ?? null, array_column(RoleCode::cases(), 'value'), true)
            ? $filters['role']
            : null;
        $career = is_string($filters['career'] ?? null) && Str::isUuid($filters['career'])
            ? $filters['career']
            : null;
        $users = User::query()
            // El listado envía además los datos que solo se leen en el panel «Ver
            // cuenta»: identidad completa, fechas y segundo factor.
            ->select([
                'id',
                'nombre',
                'correo_electronico',
                'documento_identidad',
                'activo',
                'debe_cambiar_contrasena',
                'desactivado_en',
                'dos_factores_confirmado_en',
                'creado_en',
            ])
            ->when($search, fn (Builder $query, string $term) => $query->where(
                fn (Builder $searchQuery) => $searchQuery
                    ->whereRaw('nombre ILIKE ?', ["%{$term}%"])
                    ->orWhereRaw('correo_electronico ILIKE ?', ["%{$term}%"]),
            ))
            // Los tres estados de la lista, y cada uno significa lo mismo que su insignia:
            // «activo» es una cuenta en uso, no una recién creada que nadie ha estrenado.
            ->when($status === 'active', fn (Builder $query) => $query
                ->where('activo', true)->where('debe_cambiar_contrasena', false))
            ->when($status === 'pending', fn (Builder $query) => $query
                ->where('activo', true)->where('debe_cambiar_contrasena', true))
            ->when($status === 'inactive', fn (Builder $query) => $query->where('activo', false))
            // El alcance efectivo vive en `RoleAssignment`, así que se resuelve allí y
            // aquí solo se compara con la lista de identidades que devuelve.
            ->when($role, fn (Builder $query, string $code) => $query->whereIn(
                'id',
                RoleAssignment::query()
                    ->effective()
                    ->whereHas('role', fn ($model) => $model->where('codigo', $code))
                    ->select('usuario_id'),
            ))
            ->when($career, fn (Builder $query, string $careerId) => $query->whereIn(
                'id',
                RoleAssignment::query()
                    ->effective()
                    ->where('carrera_id', $careerId)
                    ->select('usuario_id'),
            ))
            // Se cargan también las asignaciones archivadas: las columnas siguen
            // mostrando solo las vigentes y el panel de lectura muestra el historial.
            ->with(['roleAssignments' => fn ($query) => $query
                ->with(['role:id,codigo,nombre', 'career:id,nombre'])
                ->orderByDesc('creado_en')])
            ->orderBy('nombre')
            ->paginate(20)
            ->withQueryString()
            ->through(function (User $user): array {
                $effective = $user->roleAssignments->where('activo', true);

                return [
                    'id' => $user->id,
                    'nombre' => $user->nombre,
                    'correo_electronico' => $user->correo_electronico,
                    'identity_document' => $user->documento_identidad,
                    'active' => $user->activo,
                    // Una cuenta con la contraseña temporal todavía puesta no ha entrado
                    // nunca. Sin esto se ve igual que una en uso y nadie sabe a quién
                    // recordarle que revise su correo.
                    'pending_first_login' => $user->debe_cambiar_contrasena,
                    'created_at' => $user->creado_en?->toIso8601String(),
                    'deactivated_at' => $user->desactivado_en?->toIso8601String(),
                    'two_factor_enabled' => $user->dos_factores_confirmado_en !== null,
                    'roles' => $effective->map(fn ($assignment) => [
                        'name' => $assignment->role->nombre,
                        'career_name' => $assignment->career?->nombre,
                    ])->values(),
                    'careers' => $effective
                        ->map(fn ($assignment) => $assignment->career?->nombre)
                        ->values(),
                    'assignments' => $user->roleAssignments->map(fn ($assignment) => [
                        'id' => $assignment->id,
                        'role_name' => $assignment->role->nombre,
                        'career_name' => $assignment->career?->nombre,
                        'active' => $assignment->activo,
                    ])->values(),
                ];
            });

        return Inertia::render('Admin/Users/Index', [
            'users' => $users,
            'filters' => [
                'q' => $search,
                'status' => $status,
                'role' => $role,
                'career' => $career,
            ],
            'roles' => Role::query()->orderBy('nombre')->get(['codigo', 'nombre']),
            'careers' => Career::query()->where('activo', true)->orderBy('nombre')->get(['id', 'nombre']),
        ]);
    }

    public function store(CreateManagedUserRequest $request, CreateManagedUser $action): RedirectResponse
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute([
            'nombre' => $request->string('nombre')->toString(),
            'correo_electronico' => $request->string('correo_electronico')->toString(),
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
            ->orderByDesc('creado_en')]);

        return Inertia::render('Admin/Users/Show', [
            'managedUser' => [
                'id' => $user->id,
                'nombre' => $user->nombre,
                'correo_electronico' => $user->correo_electronico,
                'active' => $user->activo,
                'assignments' => $user->roleAssignments->map(fn ($assignment) => [
                    'id' => $assignment->id,
                    'role_name' => $assignment->role->nombre,
                    'career_name' => $assignment->career?->nombre,
                    'active' => $assignment->activo,
                    'effective' => $assignment->activo,
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
        ], $actor, $request);

        return back()->with('success', 'Rol asignado con su alcance.');
    }

    public function setStatus(User $user, SetUserStatusRequest $request, SetUserStatus $action): RedirectResponse
    {
        Gate::authorize('update', $user);
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($user, $request->boolean('active'), $actor, $request);

        return back()->with('success', $user->activo ? 'Cuenta activada.' : 'Cuenta desactivada y sesiones revocadas.');
    }

    /**
     * Guardado único del panel de edición: identidad siempre; rol y estado solo si vienen.
     */
    public function update(
        User $user,
        UpdateManagedUserRequest $request,
        UpdateManagedUserProfile $updateProfile,
        AssignRole $assignRole,
        SetUserStatus $setStatus,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $validated = $request->validated();
        $wasActive = $user->activo;

        // Una sola transacción: identidad, rol nuevo y estado quedan coherentes o no
        // queda nada. El estado va al final para que una desactivación cierre también
        // un nombramiento concedido en este mismo guardado.
        DB::transaction(function () use ($actor, $assignRole, $request, $setStatus, $updateProfile, $user, $validated, $wasActive): void {
            $updateProfile->execute($user, $request->profileData(), $actor, $request);

            if (array_key_exists('role_code', $validated)) {
                $assignRole->execute($user, [
                    'role_code' => $validated['role_code'],
                    'career_id' => $validated['career_id'] ?? null,
                ], $actor, $request);
            }

            if (array_key_exists('active', $validated) && (bool) $validated['active'] !== $wasActive) {
                $setStatus->execute($user, (bool) $validated['active'], $actor, $request);
            }
        });

        return back()->with('success', 'Cuenta actualizada.');
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
