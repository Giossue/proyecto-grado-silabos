<?php

namespace App\Modules\Configuration\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string $id
 * @property string $plantilla_id
 * @property string $clave
 * @property string $titulo
 * @property string|null $descripcion
 * @property int $posicion
 * @property-read SyllabusTemplate $template
 */
class TemplateSection extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $table = 'secciones_plantilla';

    /** @var list<string> */
    protected $fillable = ['plantilla_id', 'clave', 'titulo', 'descripcion', 'posicion'];

    /** @return BelongsTo<SyllabusTemplate, $this> */
    public function template(): BelongsTo
    {
        return $this->belongsTo(SyllabusTemplate::class, 'plantilla_id');
    }

    /** @return HasMany<TemplateBlock, $this> */
    public function blocks(): HasMany
    {
        return $this->hasMany(TemplateBlock::class, 'seccion_plantilla_id')->orderBy('posicion');
    }
}
