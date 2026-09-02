<?php

namespace App\Modules\Configuration\Infrastructure\Persistence\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * La plantilla institucional. Una sola, editable en el sitio (I-32): cada revisión
 * enviada conserva su propia copia de la estructura, así que aquí no hay versiones.
 *
 * @property string $id
 * @property string $nombre
 * @property string|null $descripcion
 * @property bool $activo
 * @property bool $es_institucional
 * @property array<string, mixed>|null $mapeo_documento
 * @property CarbonImmutable|null $actualizado_en
 * @property int $sections_count
 */
class SyllabusTemplate extends Model
{
    use HasUuids;

    public const CREATED_AT = 'creado_en';

    public const UPDATED_AT = 'actualizado_en';

    protected $table = 'plantillas_silabo';

    /** @var list<string> */
    protected $fillable = ['nombre', 'descripcion', 'activo', 'es_institucional', 'mapeo_documento'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['activo' => 'boolean', 'es_institucional' => 'boolean', 'mapeo_documento' => 'array'];
    }

    /** @return HasMany<TemplateSection, $this> */
    public function sections(): HasMany
    {
        return $this->hasMany(TemplateSection::class, 'plantilla_id')->orderBy('posicion');
    }

    /** @return HasMany<TemplateBlock, $this> */
    public function blocks(): HasMany
    {
        return $this->hasMany(TemplateBlock::class, 'plantilla_id');
    }

    /** @return HasMany<FieldDefinition, $this> */
    public function fields(): HasMany
    {
        return $this->hasMany(FieldDefinition::class, 'plantilla_id');
    }
}
