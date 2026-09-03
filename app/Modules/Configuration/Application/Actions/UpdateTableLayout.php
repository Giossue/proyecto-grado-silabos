<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Domain\TableLayout;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateBlock;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\InProgressWork;
use App\Modules\Syllabus\Application\ProcessLocks;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Guarda el esquema de una tabla de la plantilla (columnas, cabecera, totales, unidades). */
class UpdateTableLayout
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly ProcessLocks $locks,
        private readonly InProgressWork $work,
    ) {}

    /**
     * @param  array<string, mixed>  $layout
     * @return array<string, mixed> Esquema canónico guardado.
     */
    public function execute(TemplateBlock $block, array $layout, User $actor, Request $request): array
    {
        $activeRole = $this->roles->resolve($request);
        // Con el proceso institucional abierto, el formato está en uso: se pausa antes.
        $this->locks->assertTemplateEditable();

        if ($block->configuredContentType() !== 'table') {
            throw ValidationException::withMessages(['table' => 'Este campo no es una tabla.']);
        }

        $normalized = TableLayout::normalize($layout);

        return DB::transaction(function () use ($actor, $activeRole, $block, $normalized, $request): array {
            SyllabusTemplate::query()->whereKey($block->plantilla_id)->lockForUpdate()->firstOrFail();
            // Cambiar columnas altera lo que los docentes están llenando.
            $this->work->requireConfirmation($request);

            $configuration = $block->getAttribute('configuracion');
            $block->update([
                'configuracion' => [
                    ...(is_array($configuration) ? $configuration : []),
                    'table' => $normalized,
                ],
            ]);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'plantilla.tabla_actualizada',
                resourceType: 'bloque_plantilla',
                resourceId: $block->id,
                result: 'exito',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
                metadata: ['columns' => count($normalized['columns'])],
            );

            return $normalized;
        });
    }
}
