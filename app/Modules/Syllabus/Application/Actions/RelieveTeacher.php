<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusCollaborator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Releva a un docente en todos sus paralelos de la carrera de una vez (I-39). Los
 * paralelos con sílabo pasan por `TransferSyllabusTeacher` (mismas reglas por estado);
 * los que aún no tienen sílabo solo cambian de manos. Todo o nada: si algún sílabo está
 * en revisión, no se mueve ninguno y se dice cuál.
 *
 * @phpstan-type Summary array{parallels: int, syllabi: int}
 */
class RelieveTeacher
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly TransferSyllabusTeacher $transfer,
        private readonly RecordAuditEvent $audit,
    ) {}

    /**
     * @param  array{type: string, number: string, date: string}  $backing
     * @return Summary
     */
    public function execute(
        string $outgoingUserId,
        string $incomingUserId,
        array $backing,
        string $idempotencyKey,
        User $actor,
        Request $request,
    ): array {
        $activeRole = $this->roles->resolve($request);
        $careerId = $activeRole?->carrera_id;
        if ($activeRole?->role->codigo !== RoleCode::Coordinator->value || $careerId === null) {
            abort(403);
        }
        if ($outgoingUserId === $incomingUserId) {
            throw ValidationException::withMessages(['incoming_user_id' => 'El docente entrante debe ser distinto del saliente.']);
        }
        if (! $this->teachesInCareer($incomingUserId, $careerId)) {
            throw ValidationException::withMessages(['incoming_user_id' => 'El docente entrante no tiene un rol docente vigente en la carrera.']);
        }

        return DB::transaction(function () use ($activeRole, $actor, $backing, $careerId, $idempotencyKey, $incomingUserId, $outgoingUserId, $request): array {
            $assignments = TeacherAssignment::query()
                ->where('usuario_id', $outgoingUserId)
                ->where('activo', true)
                ->whereHas('parallel.offering.subject.curriculum', fn ($query) => $query->where('carrera_id', $careerId))
                ->with('parallel.offering.subject:id,nombre')
                ->lockForUpdate()
                ->get();
            if ($assignments->isEmpty()) {
                throw ValidationException::withMessages(['outgoing_user_id' => 'Ese docente no tiene paralelos vigentes en la carrera.']);
            }

            $collaborations = SyllabusCollaborator::query()
                ->whereIn('asignacion_docente_id', $assignments->pluck('id'))
                ->with('syllabus:id,estado,asignatura_id')
                ->get();
            $underReview = $collaborations
                ->filter(fn (SyllabusCollaborator $collaboration): bool => $collaboration->syllabus->estado === 'en_revision')
                ->map(fn (SyllabusCollaborator $collaboration): string => $assignments
                    ->firstWhere('id', $collaboration->asignacion_docente_id)?->parallel->offering->subject->nombre ?? 'una materia');
            if ($underReview->isNotEmpty()) {
                throw ValidationException::withMessages([
                    'outgoing_user_id' => 'Hay sílabos en revisión ('.$underReview->unique()->implode(', ').'). Resuélvalos antes de relevar.',
                ]);
            }

            $syllabusIds = $collaborations->pluck('silabo_id')->unique();
            foreach (Syllabus::query()->whereIn('id', $syllabusIds)->get() as $syllabus) {
                $this->transfer->execute($syllabus, $outgoingUserId, $incomingUserId, $backing, "{$idempotencyKey}-{$syllabus->id}", $actor, $request);
            }

            $movedWithoutSyllabus = 0;
            foreach ($assignments as $assignment) {
                if ($collaborations->contains('asignacion_docente_id', $assignment->id)) {
                    continue;
                }
                $assignment->update(['activo' => false]);
                TeacherAssignment::query()->create([
                    'usuario_id' => $incomingUserId,
                    'paralelo_id' => $assignment->paralelo_id,
                    'activo' => true,
                    'sustento_tipo' => $backing['type'],
                    'sustento_numero' => $backing['number'],
                    'sustento_fecha' => $backing['date'],
                ]);
                $movedWithoutSyllabus++;
            }

            $summary = ['parallels' => $assignments->count(), 'syllabi' => $syllabusIds->count()];
            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole->id,
                action: 'docente.relevo_global',
                resourceType: 'usuario',
                resourceId: $outgoingUserId,
                result: 'exito',
                metadata: [...$summary, 'incoming_user_id' => $incomingUserId, 'parallels_without_syllabus' => $movedWithoutSyllabus, 'career_id' => $careerId],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $summary;
        });
    }

    private function teachesInCareer(string $userId, string $careerId): bool
    {
        return RoleAssignment::query()
            ->effective()
            ->where('usuario_id', $userId)
            ->where('carrera_id', $careerId)
            ->whereHas('role', fn ($query) => $query->where('codigo', RoleCode::Teacher->value))
            ->whereHas('user', fn (Builder $query) => $query
                ->where('activo', true)
                ->where(fn (Builder $validity) => $validity->whereNull('vigente_desde')->orWhere('vigente_desde', '<=', now()->toDateString()))
                ->where(fn (Builder $validity) => $validity->whereNull('vigente_hasta')->orWhere('vigente_hasta', '>=', now()->toDateString())))
            ->exists();
    }
}
