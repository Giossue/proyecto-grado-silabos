<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateBlock;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateSection;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateVersion;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\ProcessLocks;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CloneTemplateVersion
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly ProcessLocks $locks,
    ) {}

    public function execute(string $sourceVersionId, User $actor, Request $request): TemplateVersion
    {
        $activeRole = $this->roles->resolve($request);
        // Con el proceso institucional abierto, el formato está en uso: se pausa antes.
        $this->locks->assertTemplateEditable();

        return DB::transaction(function () use ($actor, $activeRole, $request, $sourceVersionId): TemplateVersion {
            $source = TemplateVersion::query()
                ->with('sections.blocks.fields')
                ->whereKey($sourceVersionId)
                ->lockForUpdate()
                ->firstOrFail();
            $latestVersion = TemplateVersion::query()
                ->where('plantilla_id', $source->plantilla_id)
                ->orderByDesc('numero_version')
                ->lockForUpdate()
                ->firstOrFail();
            $nextNumber = $latestVersion->numero_version + 1;
            $clone = TemplateVersion::query()->create([
                'plantilla_id' => $source->plantilla_id,
                'numero_version' => $nextNumber,
                'estado' => 'borrador',
                'mapeo_documento' => $source->mapeo_documento,
            ]);

            foreach ($source->sections as $section) {
                $sectionClone = TemplateSection::query()->create([
                    'version_plantilla_id' => $clone->id,
                    'clave' => $section->clave,
                    'titulo' => $section->titulo,
                    'descripcion' => $section->descripcion,
                    'posicion' => $section->posicion,
                ]);

                foreach ($section->blocks as $block) {
                    $blockClone = TemplateBlock::query()->create([
                        'version_plantilla_id' => $clone->id,
                        'seccion_plantilla_id' => $sectionClone->id,
                        'clave' => $block->clave,
                        'tipo' => $block->tipo,
                        'titulo' => $block->titulo,
                        'configuracion' => $block->configuracion,
                        'posicion' => $block->posicion,
                    ]);

                    foreach ($block->fields as $field) {
                        FieldDefinition::query()->create([
                            ...$field->only([
                                'clave',
                                'etiqueta',
                                'ayuda',
                                'tipo',
                                'obligatorio',
                                'heredado',
                                'origen_maestro',
                                'editable_docente',
                                'ia_habilitada',
                                'reglas',
                                'opciones',
                                'marcador_documento',
                                'posicion',
                            ]),
                            'version_plantilla_id' => $clone->id,
                            'bloque_plantilla_id' => $blockClone->id,
                        ]);
                    }
                }
            }

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'plantilla.version_clonada',
                resourceType: 'version_plantilla',
                resourceId: $clone->id,
                result: 'exito',
                metadata: ['source_version_id' => $source->id],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $clone;
        });
    }
}
