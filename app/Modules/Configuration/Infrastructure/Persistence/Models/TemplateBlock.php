<?php

namespace App\Modules\Configuration\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use LogicException;

class TemplateBlock extends Model
{
    use HasUuids;

    protected $table = 'bloques_plantilla';

    /** @var list<string> */
    protected $fillable = ['version_plantilla_id', 'seccion_plantilla_id', 'clave', 'tipo', 'titulo', 'configuracion', 'posicion'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['configuracion' => 'array', 'posicion' => 'integer'];
    }

    /** @return BelongsTo<TemplateVersion, $this> */
    public function version(): BelongsTo
    {
        return $this->belongsTo(TemplateVersion::class, 'version_plantilla_id');
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

    protected static function booted(): void
    {
        static::saving(fn (TemplateBlock $block) => $block->guardDraft());
        static::deleting(fn (TemplateBlock $block) => $block->guardDraft());
    }

    private function guardDraft(): void
    {
        $version = $this->version()->first();

        if ($version !== null && $version->estado !== 'draft') {
            throw new LogicException('La estructura publicada es inmutable.');
        }
    }
}
