<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Domain\TablePresets;
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

/**
 * Crea la plantilla institucional con el formato oficial del sílabo (calcado del
 * sílabo IA-SW-2026): doce secciones, sus campos y las tablas ya armadas. Después
 * Administración solo renombra o ajusta sobre la hoja.
 */
class CreateSyllabusTemplate
{
    /**
     * Sección => [título, campos]. Campo => [clave, etiqueta, tipo de contenido,
     * obligatorio, preset de tabla]. Los tipos `institutional` y `flow` son bloques
     * fijos: ficha de identificación (más lo que llena el docente dentro de ella) y
     * estado de revisión.
     */
    private const BASELINE = [
        ['identificacion', 'Identificación institucional', [
            ['asignatura', 'Identificación institucional', 'institutional', true, null],
        ]],
        ['descripcion', 'Descripción de la asignatura', [
            ['descripcion', 'Descripción de la asignatura', 'text', true, null],
        ]],
        ['objetivos', 'Objetivo(s) de la asignatura', [
            ['objetivo_general', 'Objetivo general', 'text', true, null],
            ['objetivos_especificos', 'Objetivos específicos', 'bulleted_list', true, null],
        ]],
        ['resultados', 'Resultados de aprendizaje de la asignatura', [
            ['resultados_aprendizaje', 'Resultados de aprendizaje', 'bulleted_list', true, null],
        ]],
        ['habilidades', 'Habilidades blandas de la asignatura', [
            ['habilidades_blandas', 'Habilidades blandas', 'text', false, null],
        ]],
        ['planificacion', 'Distribución y planificación de las unidades curriculares', [
            ['unidades', 'Planificación de unidades', 'table', true, 'planificacion'],
        ]],
        ['metodologia', 'Metodología y ambientes de aprendizaje', [
            ['metodologia', 'Métodos de enseñanza-aprendizaje', 'bulleted_list', true, null],
            ['tecnicas_ensenanza', 'Técnicas de enseñanza', 'bulleted_list', true, null],
            ['recursos_medios', 'Recursos y medios didácticos', 'text', true, null],
            ['herramientas_tic', 'Herramientas pedagógicas, TAC e inteligencia artificial', 'bulleted_list', false, null],
            ['ambientes_aprendizaje', 'Ambientes o escenarios de aprendizaje', 'text', true, null],
        ]],
        ['evaluacion', 'Evaluación de los aprendizajes', [
            ['componentes_evaluacion', 'Escala de valoración', 'table', true, 'escala'],
            ['recuperacion', 'Recuperación y aprobación', 'text', true, null],
        ]],
        ['perfil_egreso', 'Relación de la asignatura con los resultados de aprendizaje del perfil de egreso', [
            ['contribucion_perfil', 'Contribución al perfil de egreso', 'table', true, 'perfil'],
        ]],
        ['etica', 'Conducta y comportamiento ético', [
            ['compromisos', 'El docente', 'bulleted_list', true, null],
            ['compromisos_estudiantes', 'Los estudiantes', 'bulleted_list', true, null],
        ]],
        ['bibliografia', 'Bibliografía', [
            ['bibliografia', 'Bibliografía básica', 'table', true, 'bibliografia'],
            ['bibliografia_complementaria', 'Bibliografía complementaria', 'table', false, 'bibliografia'],
        ]],
        ['revision', 'Revisión y aprobación', [
            ['estado_revision', 'Estado de revisión', 'flow', true, null],
        ]],
    ];

    /** Lo que el docente llena dentro de la ficha de identificación (I-34). */
    private const IDENTIFICATION_INPUTS = [
        ['discapacidad_tiene', 'Estudiantes con discapacidad', 'seleccion_unica', true, ['Sí', 'No']],
        ['discapacidad_tipo', 'Tipo de discapacidad', 'texto_corto', false, null],
        ['discapacidad_adaptacion', 'Descripción de la adaptación curricular', 'texto_corto', false, null],
        ['formacion_experiencia', 'Formación y experiencia académica-investigativa', 'markdown', true, null],
    ];

    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly ProcessLocks $locks,
    ) {}

    public function execute(User $actor, Request $request): SyllabusTemplate
    {
        $activeRole = $this->roles->resolve($request);
        // Con el proceso institucional abierto, el formato está en uso: se pausa antes.
        $this->locks->assertTemplateEditable();

        return DB::transaction(function () use ($actor, $activeRole, $request): SyllabusTemplate {
            if (SyllabusTemplate::query()->where('es_institucional', true)->lockForUpdate()->exists()) {
                throw ValidationException::withMessages([
                    'template' => 'La plantilla institucional ya existe. Edítela en lugar de crear otra.',
                ]);
            }

            $template = SyllabusTemplate::query()->create([
                'nombre' => SyllabusTemplate::INSTITUTIONAL_NAME,
                'descripcion' => null,
                'activo' => true,
                'es_institucional' => true,
            ]);

            foreach (self::BASELINE as $sectionPosition => [$sectionKey, $sectionTitle, $fields]) {
                $section = TemplateSection::query()->create([
                    'plantilla_id' => $template->id,
                    'clave' => $sectionKey,
                    'titulo' => $sectionTitle,
                    'posicion' => $sectionPosition + 1,
                ]);

                foreach ($fields as $blockPosition => [$fieldKey, $label, $contentType, $required, $preset]) {
                    $configuration = ['content_type' => $contentType];
                    if ($preset !== null) {
                        $configuration['table'] = TablePresets::layout($preset);
                    }
                    $block = TemplateBlock::query()->create([
                        'plantilla_id' => $template->id,
                        'seccion_plantilla_id' => $section->id,
                        'clave' => $blockPosition === 0 ? "{$sectionKey}_principal" : "{$sectionKey}_{$fieldKey}",
                        'tipo' => $this->blockType($contentType),
                        'titulo' => $label,
                        'configuracion' => $configuration,
                        'posicion' => $blockPosition + 1,
                    ]);
                    $origin = match ($contentType) {
                        'institutional' => 'asignaturas',
                        'flow' => 'flujo',
                        default => null,
                    };
                    FieldDefinition::query()->create([
                        'plantilla_id' => $template->id,
                        'bloque_plantilla_id' => $block->id,
                        'clave' => $fieldKey,
                        'etiqueta' => $label,
                        'tipo' => $this->fieldType($contentType),
                        'obligatorio' => $required,
                        'heredado' => $origin !== null,
                        'origen_maestro' => $origin,
                        'editable_docente' => $origin === null,
                        'ia_habilitada' => $contentType === 'text',
                        'posicion' => 1,
                    ]);

                    if ($contentType === 'institutional') {
                        foreach (self::IDENTIFICATION_INPUTS as $inputPosition => [$inputKey, $inputLabel, $inputType, $inputRequired, $options]) {
                            FieldDefinition::query()->create([
                                'plantilla_id' => $template->id,
                                'bloque_plantilla_id' => $block->id,
                                'clave' => $inputKey,
                                'etiqueta' => $inputLabel,
                                'tipo' => $inputType,
                                'obligatorio' => $inputRequired,
                                'heredado' => false,
                                'origen_maestro' => null,
                                'editable_docente' => true,
                                'ia_habilitada' => $inputType === 'markdown',
                                'opciones' => $options,
                                'posicion' => $inputPosition + 2,
                            ]);
                        }
                    }
                }
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

    private function blockType(string $contentType): string
    {
        // La ficha de identificación lleva campos que sí llena el docente: no es «flujo».
        return match ($contentType) {
            'flow' => 'flujo',
            'institutional', 'text' => 'narrativa',
            default => 'repetible',
        };
    }

    private function fieldType(string $contentType): string
    {
        return match ($contentType) {
            'institutional', 'flow' => 'referencia_maestra',
            'text' => 'markdown',
            default => 'repetible',
        };
    }
}
