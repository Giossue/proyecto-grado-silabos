<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SourceConflict;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SourceVersion;
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

    /** @param array{name: string, period_id: string, template_version_id: string, grouping_mode: string, source_version_ids: list<string>, start_date: string, draft_deadline: string} $data */
    public function execute(array $data, User $actor, Request $request): Convocation
    {
        $activeRole = $this->roles->resolve($request);
        if ($activeRole?->role->codigo !== RoleCode::Coordinator->value || $activeRole->carrera_id === null) {
            abort(403);
        }

        $template = TemplateVersion::query()->with('template')->findOrFail($data['template_version_id']);
        if ($template->estado !== 'published' || ! $template->template->activo || ! $template->template->es_institucional) {
            throw ValidationException::withMessages(['template_version_id' => 'Selecciona una versión publicada de la plantilla institucional.']);
        }

        $sources = SourceVersion::query()
            ->with('source')
            ->whereIn('id', $data['source_version_ids'])
            ->get();
        if ($sources->count() !== count(array_unique($data['source_version_ids']))
            || $sources->contains(fn (SourceVersion $version): bool => $version->estado !== 'active'
                || ! $version->source->activo
                || $version->source->carrera_id !== $activeRole->carrera_id)) {
            throw ValidationException::withMessages(['source_version_ids' => 'Todas las fuentes deben estar activas y pertenecer a la carrera.']);
        }
        if ($this->hasPendingConflict($data['source_version_ids'])) {
            throw ValidationException::withMessages(['source_version_ids' => 'Resuelva las contradicciones pendientes antes de fijar estas fuentes.']);
        }

        return DB::transaction(function () use ($actor, $activeRole, $data, $request): Convocation {
            $convocation = Convocation::query()->create([
                'carrera_id' => $activeRole->carrera_id,
                'periodo_academico_id' => $data['period_id'],
                'version_plantilla_id' => $data['template_version_id'],
                'nombre' => $data['name'],
                'estado' => 'preparation',
                'modo_agrupacion' => $data['grouping_mode'],
                'creado_por' => $actor->id,
            ]);

            foreach (array_unique($data['source_version_ids']) as $sourceVersionId) {
                DB::table('fuentes_convocatoria')->insert([
                    'id' => (string) Str::uuid(),
                    'convocatoria_id' => $convocation->id,
                    'version_fuente_id' => $sourceVersionId,
                    'created_at' => now(),
                    'updated_at' => now(),
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
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole->id,
                action: 'convocation.created',
                resourceType: 'convocation',
                resourceId: $convocation->id,
                result: 'success',
                metadata: ['grouping_mode' => $data['grouping_mode'], 'source_count' => count($data['source_version_ids'])],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $convocation;
        });
    }

    /** @param list<string> $sourceVersionIds */
    private function hasPendingConflict(array $sourceVersionIds): bool
    {
        return SourceConflict::query()
            ->where('estado', 'pending')
            ->where(fn ($query) => $query
                ->whereIn('version_candidata_id', $sourceVersionIds)
                ->orWhereIn('version_activa_id', $sourceVersionIds))
            ->exists();
    }
}
