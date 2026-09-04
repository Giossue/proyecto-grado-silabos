<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\FieldValue;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\RepeatableRow;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusCollaborator;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Relevar a un docente son dos cosas que deben ocurrir juntas: finalizar su asignación y
 * abrir la del reemplazo sobre los mismos paralelos. Hacerlas por separado deja una ventana en
 * la que el expediente no tiene responsable, y la apertura de convocatoria ya rechaza los
 * paralelos sin docente vigente.
 *
 * Qué pasa con el contenido depende del estado, según las decisiones A1 y DT-08:
 *
 * - Aprobado: se reabre conservando la revisión intacta. El que entra hereda el trabajo.
 * - Corrección solicitada: se conserva. Hubo envío, así que es evidencia institucional.
 * - Borrador sin enviar: se descarta y el nuevo empieza limpio.
 * - En revisión: no se traspasa. Un coordinador está evaluando contenido que envió una
 *   persona concreta; cambiarla a mitad deja la revisión sin interlocutor.
 */
class TransferSyllabusTeacher
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly ReopenSyllabus $reopen,
        private readonly RecordAuditEvent $audit,
    ) {}

    /**
     * @param  array{type: string, number: string, date: string}  $backing
     */
    public function execute(
        Syllabus $syllabus,
        string $outgoingUserId,
        string $incomingUserId,
        array $backing,
        string $idempotencyKey,
        User $actor,
        Request $request,
    ): Syllabus {
        $activeRole = $this->roles->resolve($request);
        $careerId = $syllabus->convocation()->value('carrera_id');
        if ($activeRole?->role->codigo !== RoleCode::Coordinator->value
            || $activeRole->carrera_id !== $careerId) {
            abort(403);
        }
        if ($outgoingUserId === $incomingUserId) {
            throw ValidationException::withMessages([
                'incoming_user_id' => 'El docente entrante debe ser distinto del saliente.',
            ]);
        }

        $incoming = User::query()->where('activo', true)->laborallyEffective()->find($incomingUserId);
        if ($incoming === null) {
            throw ValidationException::withMessages([
                'incoming_user_id' => 'La cuenta del docente entrante no existe o está inactiva.',
            ]);
        }
        if (! $this->teachesInCareer($incomingUserId, (string) $careerId)) {
            throw ValidationException::withMessages([
                'incoming_user_id' => 'El docente entrante no tiene un rol docente vigente en la carrera.',
            ]);
        }

        return DB::transaction(function () use (
            $activeRole, $actor, $backing, $idempotencyKey, $incomingUserId, $outgoingUserId, $request, $syllabus,
        ): Syllabus {
            $locked = Syllabus::query()->lockForUpdate()->findOrFail($syllabus->id);

            if ($locked->estado === 'en_revision') {
                throw ValidationException::withMessages([
                    'syllabus' => 'El expediente está en revisión. Resuelva la revisión antes de relevar al docente.',
                ]);
            }

            $collaborations = SyllabusCollaborator::query()
                ->with('teacherAssignment')
                ->where('silabo_id', $locked->id)
                ->where('usuario_id', $outgoingUserId)
                ->get();
            if ($collaborations->isEmpty()) {
                throw ValidationException::withMessages([
                    'outgoing_user_id' => 'Ese docente no consta como responsable de este expediente.',
                ]);
            }

            foreach ($collaborations as $collaboration) {
                $previous = $collaboration->teacherAssignment;
                $previous->update(['activo' => false]);

                $replacement = TeacherAssignment::query()->create([
                    'usuario_id' => $incomingUserId,
                    'paralelo_id' => $previous->paralelo_id,
                    'activo' => true,
                    'sustento_tipo' => $backing['type'],
                    'sustento_numero' => $backing['number'],
                    'sustento_fecha' => $backing['date'],
                ]);

                $collaboration->update([
                    'usuario_id' => $incomingUserId,
                    'asignacion_docente_id' => $replacement->id,
                ]);
            }

            $previousState = $locked->estado;
            $discardedCompletion = null;

            if ($previousState === 'aprobado') {
                // Se reabre después de mover a los colaboradores, para que el aviso de
                // reapertura llegue a quien entra y no a quien acaba de salir. La revisión
                // aprobada queda intacta: ADR-0005.
                $this->reopen->execute(
                    $locked,
                    "Relevo de docente: {$backing['type']} {$backing['number']} de {$backing['date']}.",
                    $idempotencyKey,
                    $actor,
                    $request,
                );
                $locked->refresh();
            }

            if ($previousState === 'borrador') {
                // DT-08: el borrador sin enviar no es evidencia institucional. Se conserva
                // el porcentaje perdido en auditoría para que el descarte sea rastreable.
                $discardedCompletion = (float) $locked->porcentaje_completitud;
                FieldValue::query()->where('silabo_id', $locked->id)->delete();
                RepeatableRow::query()->where('silabo_id', $locked->id)->delete();
                $locked->update([
                    'estado' => 'sin_iniciar',
                    'porcentaje_completitud' => 0,
                    'version_bloqueo' => $locked->version_bloqueo + 1,
                    'iniciado_en' => null,
                    'guardado_en' => null,
                ]);
            }

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole->id,
                action: 'silabo.docente_transferido',
                resourceType: 'silabo',
                resourceId: $locked->id,
                result: 'exito',
                metadata: [
                    'outgoing_user_id' => $outgoingUserId,
                    'incoming_user_id' => $incomingUserId,
                    'previous_state' => $previousState,
                    'parallels_moved' => $collaborations->count(),
                    'discarded_completion' => $discardedCompletion,
                    'backing_type' => $backing['type'],
                    'backing_number' => $backing['number'],
                    'backing_date' => $backing['date'],
                ],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $locked->refresh();
        });
    }

    private function teachesInCareer(string $userId, string $careerId): bool
    {
        return RoleAssignment::query()
            ->where('usuario_id', $userId)
            ->where('carrera_id', $careerId)
            ->whereHas('role', fn ($query) => $query->where('codigo', RoleCode::Teacher->value))
            ->whereHas('user', fn ($query) => $query->where('activo', true)->laborallyEffective())
            ->effective()
            ->exists();
    }
}
