<?php

namespace App\Modules\Academic\Application\Actions;

use App\Models\User;
use App\Modules\Academic\Application\OfferingModality;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Academic\Infrastructure\Persistence\Models\Campus;
use App\Modules\Academic\Infrastructure\Persistence\Models\CourseOffering;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Abre de una vez las ofertas de varias materias para un periodo y un campus. Las que ya
 * existían se saltan sin error: repetir el lote es inofensivo. La modalidad se hereda
 * igual que en la oferta suelta (I-35).
 */
class CreateOfferingBatch
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly OfferingModality $modalities,
    ) {}

    /**
     * @param  array{period_id: string, campus_id: string, subject_ids: list<string>}  $data
     * @return array{created: int, skipped: int}
     */
    public function execute(array $data, User $actor, Request $request): array
    {
        $activeRole = $this->roles->resolve($request);
        if (! $activeRole instanceof RoleAssignment || $activeRole->carrera_id === null) {
            throw new AuthorizationException('No puede abrir ofertas con el rol activo.');
        }
        $careerId = $activeRole->carrera_id;

        return DB::transaction(function () use ($actor, $activeRole, $careerId, $data, $request): array {
            $period = AcademicPeriod::query()->whereKey($data['period_id'])->lockForUpdate()->firstOrFail();
            $campus = Campus::query()->whereKey($data['campus_id'])->firstOrFail();
            $subjects = Subject::query()
                ->whereIn('id', $data['subject_ids'])
                ->whereHas('curriculum', fn ($query) => $query->where('carrera_id', $careerId)->where('estado', 'activa'))
                ->with('curriculum.career.modality')
                ->orderBy('ciclo')
                ->orderBy('orden_en_ciclo')
                ->get();
            $existing = CourseOffering::query()
                ->where('periodo_academico_id', $period->id)
                ->where('campus_id', $campus->id)
                ->whereIn('asignatura_id', $subjects->pluck('id'))
                ->pluck('asignatura_id')
                ->flip();

            $created = 0;
            foreach ($subjects as $subject) {
                if ($existing->has($subject->id)) {
                    continue;
                }
                $offering = CourseOffering::query()->create([
                    'periodo_academico_id' => $period->id,
                    'asignatura_id' => $subject->id,
                    'campus_id' => $campus->id,
                    'modalidad_id' => $this->modalities->forSubject($subject)->id,
                    'activo' => true,
                ]);
                $this->audit->execute(
                    actorId: $actor->id,
                    roleAssignmentId: $activeRole->id,
                    action: 'academico.oferta.creacion',
                    resourceType: 'oferta',
                    resourceId: $offering->id,
                    result: 'exito',
                    metadata: ['batch' => true],
                    correlationId: $request->attributes->getString('correlation_id') ?: null,
                );
                $created++;
            }

            return ['created' => $created, 'skipped' => $subjects->count() - $created];
        });
    }
}
