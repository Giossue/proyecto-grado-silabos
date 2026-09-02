<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * La malla de una carrera. Una sola por carrera, sin versiones (I-32): se edita en el
 * sitio y cada sílabo conserva su propia fotografía del contexto académico.
 *
 * @property string $id
 * @property string $carrera_id
 * @property string $codigo
 * @property string|null $codigo_institucional
 * @property string|null $descripcion
 * @property int $numero_ciclos
 * @property string $estado
 * @property int $subjects_count
 * @property-read Career $career
 */
class Curriculum extends Model
{
    use HasUuids;

    public const CREATED_AT = 'creado_en';

    public const UPDATED_AT = 'actualizado_en';

    protected $table = 'mallas';

    /** @var list<string> */
    protected $fillable = [
        'carrera_id',
        'codigo',
        'codigo_institucional',
        'descripcion',
        'numero_ciclos',
        'estado',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['numero_ciclos' => 'integer'];
    }

    /** @param Builder<self> $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('estado', 'activa');
    }

    /** @return BelongsTo<Career, $this> */
    public function career(): BelongsTo
    {
        return $this->belongsTo(Career::class, 'carrera_id');
    }

    /** @return HasMany<Subject, $this> */
    public function subjects(): HasMany
    {
        return $this->hasMany(Subject::class, 'malla_id');
    }

    /** @return HasMany<CurriculumFieldDefinition, $this> */
    public function fieldDefinitions(): HasMany
    {
        return $this->hasMany(CurriculumFieldDefinition::class, 'malla_id');
    }
}
