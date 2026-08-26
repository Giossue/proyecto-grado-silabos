<?php

namespace App\Modules\Configuration\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use LogicException;

class TemplateSection extends Model
{
    use HasUuids;

    protected $table = 'secciones_plantilla';

    /** @var list<string> */
    protected $fillable = ['version_plantilla_id', 'clave', 'titulo', 'descripcion', 'posicion'];

    /** @return BelongsTo<TemplateVersion, $this> */
    public function version(): BelongsTo
    {
        return $this->belongsTo(TemplateVersion::class, 'version_plantilla_id');
    }

    /** @return HasMany<TemplateBlock, $this> */
    public function blocks(): HasMany
    {
        return $this->hasMany(TemplateBlock::class, 'seccion_plantilla_id')->orderBy('posicion');
    }

    protected static function booted(): void
    {
        static::saving(fn (TemplateSection $section) => $section->guardDraft());
        static::deleting(fn (TemplateSection $section) => $section->guardDraft());
    }

    private function guardDraft(): void
    {
        $version = $this->version()->first();

        if ($version !== null && $version->estado !== 'draft') {
            throw new LogicException('La estructura publicada es inmutable.');
        }
    }
}
