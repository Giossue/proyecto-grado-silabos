<?php

namespace App\Modules\Configuration\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string $id
 * @property string $plantilla_id
 * @property string $seccion_plantilla_id
 * @property string $clave
 * @property string $tipo
 * @property string $titulo
 * @property array<string, mixed>|null $configuracion
 * @property int $posicion
 * @property-read SyllabusTemplate $template
 * @property-read TemplateSection $section
 */
class TemplateBlock extends Model
{
    use HasUuids;

    public const CREATED_AT = 'creado_en';

    public const UPDATED_AT = 'actualizado_en';

    protected $table = 'bloques_plantilla';

    /** @var list<string> */
    protected $fillable = ['plantilla_id', 'seccion_plantilla_id', 'clave', 'tipo', 'titulo', 'configuracion', 'posicion'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['configuracion' => 'array', 'posicion' => 'integer'];
    }

    /** @return BelongsTo<SyllabusTemplate, $this> */
    public function template(): BelongsTo
    {
        return $this->belongsTo(SyllabusTemplate::class, 'plantilla_id');
    }

    /** @return BelongsTo<TemplateSection, $this> */
    public function section(): BelongsTo
    {
        return $this->belongsTo(TemplateSection::class, 'seccion_plantilla_id');
    }

    /** @return HasMany<FieldDefinition, $this> */
    public function fields(): HasMany
    {
        return $this->hasMany(FieldDefinition::class, 'bloque_plantilla_id')->orderBy('posicion');
    }

    public function configuredContentType(): ?string
    {
        $configuration = $this->getAttribute('configuracion');

        if (! is_array($configuration)) {
            return null;
        }

        $contentType = $configuration['content_type'] ?? null;

        return is_string($contentType) ? $contentType : null;
    }
}
