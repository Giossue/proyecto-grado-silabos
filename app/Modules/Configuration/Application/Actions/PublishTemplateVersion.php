<?php

namespace App\Modules\Configuration\Application\Actions;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateBlock;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateSection;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateVersion;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Support\CanonicalHasher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PublishTemplateVersion
{
    private const REQUIRED_SECTIONS = [
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

    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly CanonicalHasher $hasher,
    ) {}

    public function execute(string $versionId, User $actor, Request $request): TemplateVersion
    {
        $activeRole = $this->roles->resolve($request);

        return DB::transaction(function () use ($actor, $activeRole, $request, $versionId): TemplateVersion {
            $version = TemplateVersion::query()
                ->with(['template:id,nombre,es_institucional', 'sections.blocks.fields'])
                ->whereKey($versionId)
                ->lockForUpdate()
                ->firstOrFail();

            if ($version->estado !== 'draft') {
                throw ValidationException::withMessages(['version' => 'La versión ya fue publicada.']);
            }

            $this->validateStructure($version);
            $snapshot = $this->snapshot($version);
            $version->update([
                'estado' => 'published',
                'huella_sha256' => $this->hasher->hash($snapshot),
                'publicado_por' => $actor->id,
                'publicado_en' => now(),
            ]);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'template.version_published',
                resourceType: 'template_version',
                resourceId: $version->id,
                result: 'success',
                metadata: ['fingerprint' => $version->huella_sha256],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $version;
        });
    }

    private function validateStructure(TemplateVersion $version): void
    {
        $sectionKeys = $version->sections->pluck('clave')->all();
        $missing = array_values(array_diff(self::REQUIRED_SECTIONS, $sectionKeys));

        if ($missing !== []) {
            throw ValidationException::withMessages([
                'version' => 'Faltan áreas funcionales obligatorias: '.implode(', ', $missing).'.',
            ]);
        }

        foreach ($version->sections as $section) {
            if ($section->blocks->isEmpty()) {
                throw ValidationException::withMessages(['version' => "La sección «{$section->titulo}» no tiene bloques."]);
            }

            foreach ($section->blocks as $block) {
                if ($block->fields->isEmpty()) {
                    throw ValidationException::withMessages(['version' => "El bloque «{$block->titulo}» no tiene campos."]);
                }

                foreach ($block->fields as $field) {
                    $this->validateField($field, $block);
                }
            }
        }

        $requiredMarkers = $version->mapeo_documento['required_markers'] ?? [];

        if (is_array($requiredMarkers)) {
            $mappedMarkers = $version->fields->pluck('marcador_documento')->filter()->all();
            $unmapped = array_diff($requiredMarkers, $mappedMarkers);

            if ($unmapped !== []) {
                throw ValidationException::withMessages([
                    'version' => 'Existen marcadores obligatorios sin campo: '.implode(', ', $unmapped).'.',
                ]);
            }
        }
    }

    private function validateField(FieldDefinition $field, TemplateBlock $block): void
    {
        if ($field->heredado && ($field->origen_maestro === null || $field->editable_docente)) {
            throw ValidationException::withMessages([
                'version' => "El campo heredado «{$field->etiqueta}» debe indicar origen y ser de solo lectura.",
            ]);
        }

        if ($block->tipo === 'workflow' && $field->editable_docente) {
            throw ValidationException::withMessages([
                'version' => 'Los metadatos de revisión no pueden ser editables por el docente.',
            ]);
        }

        if ($field->tipo === 'calculation') {
            throw ValidationException::withMessages([
                'version' => 'Los cálculos automáticos todavía no están disponibles.',
            ]);
        }
    }

    /** @return array<string, mixed> */
    private function snapshot(TemplateVersion $version): array
    {
        return [
            'template_id' => $version->plantilla_id,
            'version' => $version->numero_version,
            'document_mapping' => $version->mapeo_documento,
            'sections' => $version->sections->map(fn (TemplateSection $section) => [
                'key' => $section->clave,
                'title' => $section->titulo,
                'description' => $section->descripcion,
                'position' => $section->posicion,
                'blocks' => $section->blocks->map(fn (TemplateBlock $block) => [
                    'key' => $block->clave,
                    'type' => $block->tipo,
                    'title' => $block->titulo,
                    'configuration' => $block->configuracion,
                    'position' => $block->posicion,
                    'fields' => $block->fields->map(fn (FieldDefinition $field) => [
                        'key' => $field->clave,
                        'label' => $field->etiqueta,
                        'help' => $field->ayuda,
                        'type' => $field->tipo,
                        'required' => $field->obligatorio,
                        'inherited' => $field->heredado,
                        'master_source' => $field->origen_maestro,
                        'teacher_editable' => $field->editable_docente,
                        'ai_enabled' => $field->ia_habilitada,
                        'rules' => $field->reglas,
                        'options' => $field->opciones,
                        'document_marker' => $field->marcador_documento,
                        'position' => $field->posicion,
                    ])->values()->all(),
                ])->values()->all(),
            ])->values()->all(),
        ];
    }
}
