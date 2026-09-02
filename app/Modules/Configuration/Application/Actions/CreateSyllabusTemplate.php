<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateBlock;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateSection;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Syllabus\Application\ProcessLocks;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CreateSyllabusTemplate
{
    private const BASELINE = [
        ['identificacion', 'Identificación institucional', 'asignatura', 'Asignatura', 'referencia_maestra', true, 'asignaturas', false],
        ['descripcion', 'Descripción de la asignatura', 'descripcion', 'Descripción', 'markdown', true, null, true],
        ['objetivos', 'Objetivos', 'objetivo_general', 'Objetivo general', 'markdown', true, null, true],
        ['resultados', 'Resultados de aprendizaje', 'resultados_aprendizaje', 'Resultados de aprendizaje', 'repetible', true, null, false],
        ['habilidades', 'Habilidades blandas', 'habilidades_blandas', 'Habilidades blandas', 'repetible', false, null, false],
        ['planificacion', 'Unidades y planificación', 'unidades', 'Unidades de aprendizaje', 'repetible', true, null, false],
        ['metodologia', 'Metodología y ambientes', 'metodologia', 'Metodología', 'markdown', true, null, true],
        ['evaluacion', 'Evaluación', 'componentes_evaluacion', 'Componentes de evaluación', 'repetible', true, null, false],
        ['perfil_egreso', 'Perfil de egreso', 'contribucion_perfil', 'Contribución al perfil de egreso', 'markdown', true, null, true],
        ['etica', 'Ética y compromisos', 'compromisos', 'Compromisos', 'markdown', true, null, false],
        ['bibliografia', 'Bibliografía', 'bibliografia', 'Bibliografía', 'repetible', true, null, false],
        ['revision', 'Revisión y aprobación', 'estado_revision', 'Estado de revisión', 'referencia_maestra', true, 'flujo', false],
    ];

    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly ProcessLocks $locks,
    ) {}

    /** @param array{nombre: string, description?: string|null} $data */
    public function execute(array $data, User $actor, Request $request): SyllabusTemplate
    {
        $activeRole = $this->roles->resolve($request);
        // Con el proceso institucional abierto, el formato está en uso: se pausa antes.
        $this->locks->assertTemplateEditable();

        return DB::transaction(function () use ($actor, $activeRole, $data, $request): SyllabusTemplate {
            if (SyllabusTemplate::query()->where('es_institucional', true)->lockForUpdate()->exists()) {
                throw ValidationException::withMessages([
                    'template' => 'La plantilla institucional ya existe. Edítela en lugar de crear otra.',
                ]);
            }

            $template = SyllabusTemplate::query()->create([
                'nombre' => $data['nombre'],
                'descripcion' => $data['description'] ?? null,
                'activo' => true,
                'es_institucional' => true,
            ]);
            foreach (self::BASELINE as $position => $definition) {
                [$key, $title, $fieldKey, $label, $type, $required, $origin, $aiEnabled] = $definition;
                $section = TemplateSection::query()->create([
                    'plantilla_id' => $template->id,
                    'clave' => $key,
                    'titulo' => $title,
                    'posicion' => $position + 1,
                ]);
                $block = TemplateBlock::query()->create([
                    'plantilla_id' => $template->id,
                    'seccion_plantilla_id' => $section->id,
                    'clave' => "{$key}_principal",
                    'tipo' => $key === 'revision' ? 'flujo' : 'campos',
                    'titulo' => $title,
                    'posicion' => 1,
                ]);
                FieldDefinition::query()->create([
                    'plantilla_id' => $template->id,
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
                action: 'plantilla.creada',
                resourceType: 'plantilla_silabo',
                resourceId: $template->id,
                result: 'exito',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $template;
        });
    }
}
