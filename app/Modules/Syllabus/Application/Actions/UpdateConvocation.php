<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * La convocatoria se corrige en preparación o en pausa. Antes de abrir se cambia todo;
 * abierta y pausada, solo el nombre y las fuentes: la agrupación ya
 * generaron expedientes y cambiarlos dejaría los sílabos sin correspondencia.
 */
class UpdateConvocation
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    /** @param array{source_ids: list<string>} $data */
    public function execute(Convocation $convocation, array $data, User $actor, Request $request): Convocation
    {
        $activeRole = $this->roles->resolve($request);
        if ($activeRole?->role->codigo !== RoleCode::Coordinator->value
            || $activeRole->carrera_id !== $convocation->carrera_id) {
            abort(403);
        }

        return DB::transaction(function () use ($activeRole, $actor, $convocation, $data, $request): Convocation {
            $locked = Convocation::query()->lockForUpdate()->findOrFail($convocation->id);
            if (! in_array($locked->estado, [Convocation::STATE_PREPARATION, Convocation::STATE_PAUSED], true)) {
                throw ValidationException::withMessages([
                    'convocation' => 'Solo una convocatoria en preparación o en pausa admite cambios. Pause la convocatoria para editarla.',
                ]);
            }

            $sourceIds = array_values(array_unique($data['source_ids']));
            $sources = AcademicSource::query()->whereIn('id', $sourceIds)->get();
            if ($sources->count() !== count($sourceIds)
                || $sources->contains(fn (AcademicSource $source): bool => ! $source->activo
                    || $source->carrera_id !== $activeRole->carrera_id)) {
                throw ValidationException::withMessages(['source_ids' => 'Todas las fuentes deben estar activas y pertenecer a la carrera.']);
            }

            $before = ['source_ids' => $locked->sources()->pluck('fuentes_academicas.id')->sort()->values()->all()];

            DB::table('fuentes_convocatoria')->where('convocatoria_id', $locked->id)->delete();
            foreach ($sourceIds as $sourceId) {
                DB::table('fuentes_convocatoria')->insert([
                    'id' => (string) Str::uuid(),
                    'convocatoria_id' => $locked->id,
                    'fuente_academica_id' => $sourceId,
                    'creado_en' => now(),
                    'actualizado_en' => now(),
                ]);
            }

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole->id,
                action: 'convocatoria.actualizada',
                resourceType: 'convocatoria',
                resourceId: $locked->id,
                result: 'exito',
                metadata: [
                    'before_source_ids' => implode(',', $before['source_ids']),
                    'after_source_ids' => implode(',', collect($sourceIds)->sort()->values()->all()),
                ],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $locked->refresh();
        });
    }
}
