<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateVersion;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\ConvocationSchedule;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
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

    /** @param array{nombre: string, period_id: string, template_version_id: string, grouping_mode: string, source_ids: list<string>, start_date: string, draft_deadline: string} $data */
    public function execute(array $data, User $actor, Request $request): Convocation
    {
        $activeRole = $this->roles->resolve($request);
        if ($activeRole?->role->codigo !== RoleCode::Coordinator->value || $activeRole->carrera_id === null) {
            abort(403);
        }

        $template = TemplateVersion::query()->with('template')->findOrFail($data['template_version_id']);
        if ($template->estado !== 'publicada' || ! $template->template->activo || ! $template->template->es_institucional) {
            throw ValidationException::withMessages(['template_version_id' => 'Selecciona una versión publicada de la plantilla institucional.']);
        }

        $sources = AcademicSource::query()->whereIn('id', $data['source_ids'])->get();
        if ($sources->count() !== count(array_unique($data['source_ids']))
            || $sources->contains(fn (AcademicSource $source): bool => ! $source->activo
                || $source->carrera_id !== $activeRole->carrera_id)) {
            throw ValidationException::withMessages(['source_ids' => 'Todas las fuentes deben estar activas y pertenecer a la carrera.']);
        }

        return DB::transaction(function () use ($actor, $activeRole, $data, $request): Convocation {
            $convocation = Convocation::query()->create([
                'carrera_id' => $activeRole->carrera_id,
                'periodo_academico_id' => $data['period_id'],
                'version_plantilla_id' => $data['template_version_id'],
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
            // Dos etapas: la de inicio vence cuando se habilita la elaboración y la de
            // borrador cuando se cierra el envío.
            foreach ([
                ConvocationSchedule::STAGE_START => $data['start_date'],
                ConvocationSchedule::STAGE_DRAFT => $data['draft_deadline'],
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
                metadata: ['grouping_mode' => $data['grouping_mode'], 'source_count' => count($data['source_ids'])],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $convocation;
        });
    }
}
