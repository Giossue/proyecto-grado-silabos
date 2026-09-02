<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Nombre, plantilla y fechas se cambian solo en preparación o en pausa. Con el proceso
 * abierto, los docentes ya están llenando ese formato contra esas fechas. Los expedientes
 * creados antes del cambio conservan su plantilla: solo las convocatorias que se abran
 * después heredan la nueva.
 */
class UpdateSyllabusProcess
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    /** @param array{nombre: string, template_version_id: string, starts_at: string, due_at: string} $data */
    public function execute(SyllabusProcess $process, array $data, User $actor, Request $request): SyllabusProcess
    {
        $activeRole = $this->roles->resolve($request);
        if ($activeRole?->role->codigo !== RoleCode::Administrator->value) {
            abort(403);
        }

        return DB::transaction(function () use ($actor, $activeRole, $data, $process, $request): SyllabusProcess {
            $locked = SyllabusProcess::query()->lockForUpdate()->findOrFail($process->id);
            if (! $locked->isConfigurable()) {
                throw ValidationException::withMessages([
                    'process' => 'Solo un proceso en preparación o en pausa admite cambios. Pause el proceso para modificar la plantilla o las fechas.',
                ]);
            }

            CreateSyllabusProcess::assertPublishedTemplate($data['template_version_id']);

            $before = [
                'before_nombre' => $locked->nombre,
                'before_template_version_id' => $locked->version_plantilla_id,
                'before_starts_at' => $locked->inicia_en->toIso8601String(),
                'before_due_at' => $locked->entrega_en->toIso8601String(),
            ];
            $locked->update([
                'nombre' => $data['nombre'],
                'version_plantilla_id' => $data['template_version_id'],
                'inicia_en' => $data['starts_at'],
                'entrega_en' => $data['due_at'],
            ]);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole->id,
                action: 'proceso_silabos.actualizado',
                resourceType: 'proceso_silabos',
                resourceId: $locked->id,
                result: 'exito',
                metadata: [
                    ...$before,
                    'after_nombre' => $locked->nombre,
                    'after_template_version_id' => $locked->version_plantilla_id,
                    'after_starts_at' => $locked->inicia_en->toIso8601String(),
                    'after_due_at' => $locked->entrega_en->toIso8601String(),
                ],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $locked;
        });
    }
}
