<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateVersion;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Operations\Infrastructure\Persistence\Models\JobExecution;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Support\RoleArea;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * El panel resume el trabajo con el alcance del rol activo. Ninguna métrica cruza ese
 * alcance: Coordinación cuenta dentro de su carrera y Docencia solo lo propio.
 */
class DashboardController extends Controller
{
    public function index(Request $request, ActiveRole $roles): Response|RedirectResponse
    {
        $activeRole = $roles->resolve($request);
        $user = $request->user();

        /*
         * El panel es la misma pantalla para los tres roles, pero cada uno tiene la suya
         * en su área. La dirección corta, protegida por `active-role`, llega con el rol
         * resuelto y lleva a la copia que corresponde.
         */
        $area = $activeRole === null ? null : RoleArea::routePrefix();

        if ($area !== null && $request->route()?->getName() === 'dashboard') {
            return redirect()->route("{$area}.dashboard");
        }

        $metrics = match (true) {
            $activeRole === null || ! $user instanceof User => [],
            $activeRole->role->codigo === RoleCode::Administrator->value => $this->administratorMetrics(),
            $activeRole->role->codigo === RoleCode::Coordinator->value => $this->coordinatorMetrics($activeRole->carrera_id),
            $activeRole->role->codigo === RoleCode::Teacher->value => $this->teacherMetrics($user, $activeRole->carrera_id),
            default => [],
        };

        return Inertia::render('Dashboard', ['metrics' => $metrics]);
    }

    /** @return list<array{key: string, label: string, value: int, hint: string}> */
    private function administratorMetrics(): array
    {
        return [
            [
                'key' => 'users',
                'label' => 'Usuarios activos',
                'value' => User::query()->where('activo', true)->count(),
                'hint' => 'Cuentas habilitadas para iniciar sesión',
            ],
            [
                'key' => 'careers',
                'label' => 'Carreras activas',
                'value' => Career::query()->where('activo', true)->count(),
                'hint' => 'Carreras vigentes en la estructura académica',
            ],
            [
                'key' => 'templates',
                'label' => 'Plantillas publicadas',
                'value' => TemplateVersion::query()->where('estado', 'publicada')->count(),
                'hint' => 'Versiones publicadas disponibles para convocatorias',
            ],
            [
                'key' => 'failed_jobs',
                'label' => 'Procesos fallidos',
                'value' => JobExecution::query()->where('estado', 'fallida')->count(),
                'hint' => 'Correos, documentos y análisis que terminaron en error',
            ],
        ];
    }

    /** @return list<array{key: string, label: string, value: int, hint: string}> */
    private function coordinatorMetrics(?string $careerId): array
    {
        $syllabi = fn (string $state): int => Syllabus::query()
            ->where('estado', $state)
            ->whereHas('convocation', fn (Builder $query) => $query->where('carrera_id', $careerId))
            ->count();

        return [
            [
                'key' => 'open_convocations',
                'label' => 'Convocatorias abiertas',
                'value' => Convocation::query()
                    ->where('carrera_id', $careerId)
                    ->where('estado', 'abierta')
                    ->count(),
                'hint' => 'Convocatorias en curso de su carrera',
            ],
            [
                'key' => 'in_review',
                'label' => 'En revisión',
                'value' => $syllabi('en_revision'),
                'hint' => 'Expedientes enviados que esperan su revisión',
            ],
            [
                'key' => 'correction_requested',
                'label' => 'Con corrección solicitada',
                'value' => $syllabi('correccion_solicitada'),
                'hint' => 'Devueltos al docente y aún sin reenviar',
            ],
            [
                'key' => 'approved',
                'label' => 'Aprobados',
                'value' => $syllabi('aprobado'),
                'hint' => 'Expedientes con aprobación vigente',
            ],
        ];
    }

    /** @return list<array{key: string, label: string, value: int, hint: string}> */
    private function teacherMetrics(User $user, ?string $careerId): array
    {
        $own = fn (): Builder => Syllabus::query()
            ->whereHas('convocation', fn (Builder $query) => $query->where('carrera_id', $careerId))
            ->whereHas('collaborators', fn (Builder $query) => $query->where('usuario_id', $user->id));

        return [
            [
                'key' => 'assigned',
                'label' => 'Sílabos asignados',
                'value' => $own()->count(),
                'hint' => 'Expedientes en los que colabora',
            ],
            [
                'key' => 'draft',
                'label' => 'En borrador',
                'value' => $own()->where('estado', 'borrador')->count(),
                'hint' => 'Editables y aún sin enviar',
            ],
            [
                'key' => 'in_review',
                'label' => 'En revisión',
                'value' => $own()->where('estado', 'en_revision')->count(),
                'hint' => 'Enviados y a la espera de Coordinación',
            ],
            [
                'key' => 'correction_requested',
                'label' => 'Requieren corrección',
                'value' => $own()->where('estado', 'correccion_solicitada')->count(),
                'hint' => 'Devueltos con observaciones por responder',
            ],
        ];
    }
}
