<?php

namespace App\Modules\Identity\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Application\CoordinationMandate;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SetUserStatus
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly CoordinationMandate $mandate,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(User $target, bool $active, User $actor, Request $request): User
    {
        $activeRole = $this->roles->resolve($request);

        return DB::transaction(function () use ($active, $actor, $activeRole, $request, $target): User {
            if (! $active) {
                $this->ensureMayDeactivate($target);
            }

            $target->update(['activo' => $active]);

            $closedMandates = 0;
            $closedTeacherAssignments = 0;

            if (! $active) {
                DB::table('sesiones')->where('user_id', $target->id)->delete();
                // Un nombramiento abierto de una cuenta desactivada bloquea la carrera:
                // la base no admite dos coordinaciones vigentes a la vez.
                $closedMandates = $this->mandate->closeFor($target->id);
                // Ningún paralelo queda a nombre de alguien que ya no está (I-39); los
                // sílabos en curso se relevaron antes, porque `ensureMayDeactivate` lo exige.
                $closedTeacherAssignments = DB::table('asignaciones_docente')
                    ->where('usuario_id', $target->id)
                    ->where('activo', true)
                    ->update(['activo' => false]);
            }

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: $active ? 'usuario.activado' : 'usuario.desactivado',
                resourceType: 'usuario',
                resourceId: $target->id,
                result: 'exito',
                metadata: ['closed_coordinations' => $closedMandates, 'closed_teacher_assignments' => $closedTeacherAssignments],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $target;
        });
    }

    /**
     * Desactivar no puede dejar huérfano nada: ni la administración de la institución ni
     * un sílabo en curso. Lo segundo lo resuelve Coordinación con el relevo docente.
     */
    private function ensureMayDeactivate(User $target): void
    {
        $isAdministrator = RoleAssignment::query()
            ->effective()
            ->where('usuario_id', $target->id)
            ->whereHas('role', fn ($query) => $query->where('codigo', RoleCode::Administrator->value))
            ->exists();
        if ($isAdministrator) {
            $otherAdministrators = RoleAssignment::query()
                ->effective()
                ->where('usuario_id', '!=', $target->id)
                ->whereHas('role', fn ($query) => $query->where('codigo', RoleCode::Administrator->value))
                ->whereHas('user', fn ($query) => $query->where('activo', true))
                ->exists();
            if (! $otherAdministrators) {
                throw ValidationException::withMessages([
                    'active' => 'Es la única cuenta de administración activa. Nombre otra antes de desactivarla.',
                ]);
            }
        }

        $inProgress = DB::table('colaboradores_silabo')
            ->join('silabos', 'silabos.id', '=', 'colaboradores_silabo.silabo_id')
            ->join('convocatorias_carreras', 'convocatorias_carreras.id', '=', 'silabos.convocatoria_id')
            ->join('carreras', 'carreras.id', '=', 'convocatorias_carreras.carrera_id')
            ->where('colaboradores_silabo.usuario_id', $target->id)
            ->whereIn('silabos.estado', ['borrador', 'en_revision', 'correccion_solicitada'])
            ->where('convocatorias_carreras.estado', 'abierta')
            ->groupBy('carreras.nombre')
            ->selectRaw('carreras.nombre AS carrera, COUNT(*) AS total')
            ->get();
        if ($inProgress->isNotEmpty()) {
            $detail = $inProgress->map(fn (object $row): string => "{$row->total} en {$row->carrera}")->implode(', ');
            throw ValidationException::withMessages([
                'active' => "Tiene sílabos en curso ({$detail}). Coordinación debe relevar al docente antes de desactivar la cuenta.",
            ]);
        }
    }
}
