<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Administración fija el calendario institucional. El proceso nace en preparación: la
 * plantilla y las fechas se pueden corregir hasta que se abre.
 */
class CreateSyllabusProcess
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    /** @param array{nombre: string, period_id: string, starts_at: string, due_at: string} $data */
    public function execute(array $data, User $actor, Request $request): SyllabusProcess
    {
        $activeRole = $this->roles->resolve($request);
        if ($activeRole?->role->codigo !== RoleCode::Administrator->value) {
            abort(403);
        }

        $template = self::institutionalTemplate();

        return DB::transaction(function () use ($actor, $activeRole, $data, $request, $template): SyllabusProcess {
            if (SyllabusProcess::query()->where('periodo_academico_id', $data['period_id'])->exists()) {
                throw ValidationException::withMessages([
                    'period_id' => 'Ya existe una convocatoria institucional para este período académico.',
                ]);
            }
            $process = SyllabusProcess::query()->create([
                'nombre' => $data['nombre'],
                'plantilla_id' => $template->id,
                'periodo_academico_id' => $data['period_id'],
                'inicia_en' => $data['starts_at'],
                'entrega_en' => $data['due_at'],
                'estado' => SyllabusProcess::STATE_PREPARATION,
                'creado_por' => $actor->id,
            ]);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole->id,
                action: 'proceso_silabos.creado',
                resourceType: 'proceso_silabos',
                resourceId: $process->id,
                result: 'exito',
                metadata: [
                    'template_id' => $process->plantilla_id,
                    'period_id' => $process->periodo_academico_id,
                    'starts_at' => $process->inicia_en->toIso8601String(),
                    'due_at' => $process->entrega_en->toIso8601String(),
                ],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $process;
        });
    }

    /** La plantilla es una sola (I-32): el proceso la toma tal como está. */
    public static function institutionalTemplate(): SyllabusTemplate
    {
        $template = SyllabusTemplate::query()
            ->where('es_institucional', true)
            ->where('activo', true)
            ->first();

        if ($template === null) {
            throw ValidationException::withMessages([
                'process' => 'No existe una plantilla institucional activa. Créela en Plantillas antes de preparar el proceso.',
            ]);
        }

        return $template;
    }
}
