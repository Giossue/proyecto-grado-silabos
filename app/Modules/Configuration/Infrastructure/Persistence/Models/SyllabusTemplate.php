<?php

namespace App\Modules\Configuration\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SyllabusTemplate extends Model
{
    use HasUuids;

    public const CREATED_AT = 'creado_en';

    public const UPDATED_AT = 'actualizado_en';

    protected $table = 'plantillas_silabo';

    /** @var list<string> */
    protected $fillable = ['nombre', 'descripcion', 'activo', 'es_institucional'];

    /** @return HasMany<TemplateVersion, $this> */
    public function versions(): HasMany
    {
        return $this->hasMany(TemplateVersion::class, 'plantilla_id');
    }
}
