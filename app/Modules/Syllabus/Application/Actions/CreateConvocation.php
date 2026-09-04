<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\ConvocationSchedule;
use App\Modules\Syllabus\Application\SyncConvocationSources;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/** Coordinación inicia el alcance heredado de la convocatoria institucional. */
class CreateConvocation
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly OpenConvocation $open,
        private readonly SyncConvocationSources $sources,
    ) {}

    /** @param array{process_id: string} $data */
    public function execute(array $data, User $actor, Request $request): Convocation
    {
        $activeRole = $this->roles->resolve($request);
        if ($activeRole?->role->codigo !== RoleCode::Coordinator->value || $activeRole->carrera_id === null) {
            abort(403);
        }

        return DB::transaction(function () use ($activeRole, $actor, $data, $request): Convocation {
            $process = SyllabusProcess::query()->lockForUpdate()->with('academicPeriod')->findOrFail($data['process_id']);
            if ($process->estado !== SyllabusProcess::STATE_OPEN) {
                throw ValidationException::withMessages(['process_id' => 'La convocatoria institucional todavía no está abierta.']);
            }
            if (Convocation::query()->where('carrera_id', $activeRole->carrera_id)->where('periodo_academico_id', $process->periodo_academico_id)->exists()) {
                throw ValidationException::withMessages(['process_id' => 'Esta carrera ya tiene una convocatoria para el período institucional.']);
            }

            $convocation = Convocation::query()->create([
                'carrera_id' => $activeRole->carrera_id,
                'proceso_id' => $process->id,
                'periodo_academico_id' => $process->periodo_academico_id,
                'plantilla_id' => $process->plantilla_id,
                'nombre' => $process->nombre,
                'estado' => Convocation::STATE_PREPARATION,
                'modo_agrupacion' => 'por_paralelo',
                'creado_por' => $actor->id,
            ]);
            $sourceCount = $this->sources->execute($convocation);
            foreach ([ConvocationSchedule::STAGE_START => $process->inicia_en, ConvocationSchedule::STAGE_DRAFT => $process->entrega_en] as $stage => $dueAt) {
                DB::table('fechas_limite_convocatoria')->insert([
                    'id' => (string) Str::uuid(), 'convocatoria_id' => $convocation->id, 'etapa' => $stage,
                    'vence_en' => $dueAt, 'creado_en' => now(), 'actualizado_en' => now(),
                ]);
            }
            $this->audit->execute(
                actorId: $actor->id, roleAssignmentId: $activeRole->id,
                action: 'convocatoria.iniciada', resourceType: 'convocatoria', resourceId: $convocation->id,
                result: 'exito',
                metadata: ['process_id' => $process->id, 'period_id' => $process->periodo_academico_id, 'source_count' => $sourceCount, 'grouping_mode' => 'por_paralelo'],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $this->open->execute($convocation->id, $actor, $request);
        });
    }
}
