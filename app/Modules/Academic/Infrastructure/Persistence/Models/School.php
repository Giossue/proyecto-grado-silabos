<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Nivel intermedio de la estructura institucional: la fuente organiza
 * facultad -> escuela -> carrera.
 *
 * @property string $id
 * @property string $facultad_id
 * @property string $nombre
 * @property bool $activo
 * @property-read Faculty $faculty
 */
class School extends Model
{
    use HasUuids;

    public const CREATED_AT = 'creado_en';

    public const UPDATED_AT = 'actualizado_en';

    protected $table = 'escuelas';

    /** @var list<string> */
    protected $fillable = ['facultad_id', 'nombre', 'activo'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['activo' => 'boolean'];
    }

    /** @return BelongsTo<Faculty, $this> */
    public function faculty(): BelongsTo
    {
        return $this->belongsTo(Faculty::class, 'facultad_id');
    }

    /** @return HasMany<Career, $this> */
    public function careers(): HasMany
    {
        return $this->hasMany(Career::class, 'escuela_id');
    }
}
