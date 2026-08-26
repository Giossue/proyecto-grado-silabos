<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateBlock;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateSection;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateVersion;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CreateSyllabusTemplate
{
    private const BASELINE = [
        ['identificacion', 'Identificación institucional', 'asignatura', 'Asignatura', 'master_reference', true, 'asignaturas', false],
        ['descripcion', 'Descripción de la asignatura', 'descripcion', 'Descripción', 'markdown', true, null, true],
        ['objetivos', 'Objetivos', 'objetivo_general', 'Objetivo general', 'markdown', true, null, true],
        ['resultados', 'Resultados de aprendizaje', 'resultados_aprendizaje', 'Resultados de aprendizaje', 'repeatable', true, null, false],
        ['habilidades', 'Habilidades blandas', 'habilidades_blandas', 'Habilidades blandas', 'repeatable', false, null, false],
        ['planificacion', 'Unidades y planificación', 'unidades', 'Unidades de aprendizaje', 'repeatable', true, null, false],
        ['metodologia', 'Metodología y ambientes', 'metodologia', 'Metodología', 'markdown', true, null, true],
        ['evaluacion', 'Evaluación', 'componentes_evaluacion', 'Componentes de evaluación', 'repeatable', true, null, false],
        ['perfil_egreso', 'Perfil de egreso', 'contribucion_perfil', 'Contribución al perfil de egreso', 'markdown', true, null, true],
        ['etica', 'Ética y compromisos', 'compromisos', 'Compromisos', 'markdown', true, null, false],
        ['bibliografia', 'Bibliografía', 'bibliografia', 'Bibliografía', 'repeatable', true, null, false],
        ['revision', 'Revisión y aprobación', 'estado_revision', 'Estado de revisión', 'master_reference', true, 'workflow', false],
    ];

    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    /** @param array{name: string, description?: string|null, career_id?: string|null} $data */
    public function execute(array $data, User $actor, Request $request): TemplateVersion
    {
        $activeRole = $this->roles->resolve($request);

        return DB::transaction(function () use ($actor, $activeRole, $data, $request): TemplateVersion {
            $template = SyllabusTemplate::query()->create([
                'carrera_id' => $data['career_id'] ?? null,
                'nombre' => $data['name'],
                'descripcion' => $data['description'] ?? null,
                'activo' => true,
            ]);
            $version = TemplateVersion::query()->create([
                'plantilla_id' => $template->id,
                'numero_version' => 1,
                'estado' => 'draft',
            ]);

            foreach (self::BASELINE as $position => $definition) {
                [$key, $title, $fieldKey, $label, $type, $required, $origin, $aiEnabled] = $definition;
                $section = TemplateSection::query()->create([
                    'version_plantilla_id' => $version->id,
                    'clave' => $key,
                    'titulo' => $title,
                    'posicion' => $position + 1,
                ]);
                $block = TemplateBlock::query()->create([
                    'version_plantilla_id' => $version->id,
                    'seccion_plantilla_id' => $section->id,
                    'clave' => "{$key}_principal",
                    'tipo' => $key === 'revision' ? 'workflow' : 'fields',
                    'titulo' => $title,
                    'posicion' => 1,
                ]);
                FieldDefinition::query()->create([
                    'version_plantilla_id' => $version->id,
                    'bloque_plantilla_id' => $block->id,
                    'clave' => $fieldKey,
                    'etiqueta' => $label,
                    'tipo' => $type,
                    'obligatorio' => $required,
                    'heredado' => $origin !== null,
                    'origen_maestro' => $origin,
                    'editable_docente' => $origin === null,
                    'ia_habilitada' => $aiEnabled,
                    'posicion' => 1,
                ]);
            }

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'template.created',
                resourceType: 'syllabus_template',
                resourceId: $template->id,
                result: 'success',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $version;
        });
    }
}
