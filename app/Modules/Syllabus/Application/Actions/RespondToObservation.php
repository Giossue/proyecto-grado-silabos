<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\ObservationResponse;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\ReviewObservation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RespondToObservation
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(
        Syllabus $syllabus,
        ReviewObservation $observation,
        string $content,
        User $actor,
        Request $request,
    ): ObservationResponse {
        return DB::transaction(function () use ($actor, $content, $observation, $request, $syllabus): ObservationResponse {
            $locked = Syllabus::query()->lockForUpdate()->findOrFail($syllabus->id);
            if ($locked->estado !== 'correccion_solicitada' || ! $this->wasRequested($locked, $observation)) {
                throw ValidationException::withMessages([
                    'observation' => 'La observación no forma parte de la corrección habilitada.',
                ]);
            }

            $response = ObservationResponse::query()
                ->where('observacion_revision_id', $observation->id)
                ->lockForUpdate()
                ->first();
            if ($response?->revision_respuesta_id !== null) {
                throw ValidationException::withMessages(['response' => 'La respuesta ya fue enviada y es inmutable.']);
            }
            if ($response === null) {
                $response = ObservationResponse::query()->create([
                    'silabo_id' => $locked->id,
                    'observacion_revision_id' => $observation->id,
                    'contenido' => $content,
                    'respondido_por' => $actor->id,
                    'respondido_en' => now(),
                ]);
            } else {
                $response->update([
                    'contenido' => $content,
                    'respondido_por' => $actor->id,
                    'respondido_en' => now(),
                ]);
            }
            if ($observation->estado !== 'respondida') {
                $observation->update(['estado' => 'respondida']);
            }

            $activeRole = $this->roles->resolve($request);
            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'silabo.observacion_respondida',
                resourceType: 'respuesta_observacion',
                resourceId: $response->id,
                result: 'exito',
                metadata: ['observation_id' => $observation->id],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $response;
        });
    }

    private function wasRequested(Syllabus $syllabus, ReviewObservation $observation): bool
    {
        return DB::table('solicitud_correccion_observaciones as sco')
            ->join('solicitudes_correccion as sc', 'sc.id', '=', 'sco.solicitud_correccion_id')
            ->where('sc.silabo_id', $syllabus->id)
            ->where('sco.observacion_revision_id', $observation->id)
            ->exists();
    }
}
