<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\ConvocationSchedule;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CreateConvocation
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    /**
     * La plantilla y las fechas no se eligen aquí: vienen del proceso institucional. La
     * carrera decide agrupación y fuentes; el período viene del proceso institucional.
     *
     * @param  array{nombre: string, process_id: string, grouping_mode: string, source_ids: list<string>}  $data
     */
    public function execute(array $data, User $actor, Request $request): Convocation
    {
        $activeRole = $this->roles->resolve($request);
        if ($activeRole?->role->codigo !== RoleCode::Coordinator->value || $activeRole->carrera_id === null) {
            abort(403);
        }

        $process = SyllabusProcess::query()->with(['template', 'academicPeriod'])->findOrFail($data['process_id']);
        if ($process->estado === SyllabusProcess::STATE_CLOSED) {
            throw ValidationException::withMessages(['process_id' => 'El proceso ya está cerrado; elija uno vigente.']);
        }
        if (! $process->template->activo || ! $process->template->es_institucional) {
            throw ValidationException::withMessages(['process_id' => 'La plantilla del proceso está archivada; Administración debe corregirla.']);
        }
        if (! $process->academicPeriod->activo) {
            throw ValidationException::withMessages(['process_id' => 'El período del proceso está archivado; Administración debe corregir el proceso.']);
        }

        $sources = AcademicSource::query()->whereIn('id', $data['source_ids'])->get();
        if ($sources->count() !== count(array_unique($data['source_ids']))
            || $sources->contains(fn (AcademicSource $source): bool => ! $source->activo
                || $source->carrera_id !== $activeRole->carrera_id)) {
            throw ValidationException::withMessages(['source_ids' => 'Todas las fuentes deben estar activas y pertenecer a la carrera.']);
        }

        return DB::transaction(function () use ($actor, $activeRole, $data, $process, $request): Convocation {
            $convocation = Convocation::query()->create([
                'carrera_id' => $activeRole->carrera_id,
                'proceso_id' => $process->id,
                'periodo_academico_id' => $process->periodo_academico_id,
                'plantilla_id' => $process->plantilla_id,
                'nombre' => $data['nombre'],
                'estado' => 'preparacion',
                'modo_agrupacion' => $data['grouping_mode'],
                'creado_por' => $actor->id,
            ]);

            foreach (array_unique($data['source_ids']) as $sourceId) {
                DB::table('fuentes_convocatoria')->insert([
                    'id' => (string) Str::uuid(),
                    'convocatoria_id' => $convocation->id,
                    'fuente_academica_id' => $sourceId,
                    'creado_en' => now(),
                    'actualizado_en' => now(),
                ]);
            }
            // Dos etapas copiadas del calendario institucional: la de inicio vence cuando
            // se habilita la elaboración y la de borrador cuando se cierra el envío. Se
            // copian, no se referencian, porque la carrera puede prorrogar la suya.
            foreach ([
                ConvocationSchedule::STAGE_START => $process->inicia_en,
                ConvocationSchedule::STAGE_DRAFT => $process->entrega_en,
            ] as $stage => $dueAt) {
                DB::table('fechas_limite_convocatoria')->insert([
                    'id' => (string) Str::uuid(),
                    'convocatoria_id' => $convocation->id,
                    'etapa' => $stage,
                    'vence_en' => $dueAt,
                    'creado_en' => now(),
                    'actualizado_en' => now(),
                ]);
            }

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole->id,
                action: 'convocatoria.creada',
                resourceType: 'convocatoria',
                resourceId: $convocation->id,
                result: 'exito',
                metadata: ['process_id' => $process->id, 'period_id' => $process->periodo_academico_id, 'grouping_mode' => $data['grouping_mode'], 'source_count' => count($data['source_ids'])],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $convocation;
        });
    }
}
