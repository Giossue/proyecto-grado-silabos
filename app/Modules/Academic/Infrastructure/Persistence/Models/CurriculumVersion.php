<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string $id
 * @property string $carrera_id
 * @property string $codigo
 * @property string|null $codigo_institucional
 * @property string|null $descripcion
 * @property int $numero_version
 * @property int $numero_ciclos
 * @property string $estado
 * @property CarbonImmutable|null $publicado_en
 * @property int $subjects_count
 * @property-read Career $career
 */
class CurriculumVersion extends Model
{
    use HasUuids;

    protected $table = 'versiones_malla';

    /** @var list<string> */
    protected $fillable = [
        'carrera_id',
        'codigo',
        'codigo_institucional',
        'descripcion',
        'numero_version',
        'numero_ciclos',
        'estado',
        'publicado_en',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'numero_version' => 'integer',
            'numero_ciclos' => 'integer',
            'publicado_en' => 'immutable_datetime',
        ];
    }

    /** @return BelongsTo<Career, $this> */
    public function career(): BelongsTo
    {
        return $this->belongsTo(Career::class, 'carrera_id');
    }

    /** @return HasMany<Subject, $this> */
    public function subjects(): HasMany
    {
        return $this->hasMany(Subject::class, 'version_malla_id');
    }

    /** @return HasMany<CurriculumFieldDefinition, $this> */
    public function fieldDefinitions(): HasMany
    {
        return $this->hasMany(CurriculumFieldDefinition::class, 'version_malla_id');
    }
}
