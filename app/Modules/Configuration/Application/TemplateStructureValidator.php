<?php

namespace App\Modules\Configuration\Application;

use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateBlock;
use Illuminate\Validation\ValidationException;

/**
 * Lo que antes se comprobaba al publicar una versión se comprueba ahora al abrir o
 * reanudar el proceso: es el momento en que la plantilla empieza a usarse de verdad.
 */
class TemplateStructureValidator
{
    /** @var list<string> */
    public const REQUIRED_SECTIONS = [
        'identificacion',
        'descripcion',
        'objetivos',
        'resultados',
        'habilidades',
        'planificacion',
        'metodologia',
        'evaluacion',
        'perfil_egreso',
        'etica',
        'bibliografia',
        'revision',
    ];

    /** @throws ValidationException */
    public function assertUsable(SyllabusTemplate $template, string $errorKey = 'template'): void
    {
        $template->loadMissing('sections.blocks.fields');

        $missing = array_values(array_diff(self::REQUIRED_SECTIONS, $template->sections->pluck('clave')->all()));
        if ($missing !== []) {
            throw ValidationException::withMessages([
                $errorKey => 'La plantilla no tiene las áreas obligatorias: '.implode(', ', $missing).'.',
            ]);
        }

        foreach ($template->sections as $section) {
            if ($section->blocks->isEmpty()) {
                throw ValidationException::withMessages([$errorKey => "La sección «{$section->titulo}» de la plantilla no tiene bloques."]);
            }

            foreach ($section->blocks as $block) {
                if ($block->fields->isEmpty()) {
                    throw ValidationException::withMessages([$errorKey => "El bloque «{$block->titulo}» de la plantilla no tiene campos."]);
                }

                foreach ($block->fields as $field) {
                    $this->assertField($field, $block, $errorKey);
                }
            }
        }

        $requiredMarkers = $template->mapeo_documento['required_markers'] ?? [];
        if (is_array($requiredMarkers)) {
            $mappedMarkers = $template->fields()->pluck('marcador_documento')->filter()->all();
            $unmapped = array_diff($requiredMarkers, $mappedMarkers);

            if ($unmapped !== []) {
                throw ValidationException::withMessages([
                    $errorKey => 'La plantilla tiene marcadores de documento obligatorios sin campo: '.implode(', ', $unmapped).'.',
                ]);
            }
        }
    }

    private function assertField(FieldDefinition $field, TemplateBlock $block, string $errorKey): void
    {
        if ($field->heredado && ($field->origen_maestro === null || $field->editable_docente)) {
            throw ValidationException::withMessages([
                $errorKey => "El campo heredado «{$field->etiqueta}» debe indicar origen y ser de solo lectura.",
            ]);
        }

        if ($block->tipo === 'flujo' && $field->editable_docente) {
            throw ValidationException::withMessages([
                $errorKey => 'Los metadatos de revisión no pueden ser editables por el docente.',
            ]);
        }

        if ($field->tipo === 'calculo') {
            throw ValidationException::withMessages([
                $errorKey => 'Los cálculos automáticos todavía no están disponibles.',
            ]);
        }
    }
}
