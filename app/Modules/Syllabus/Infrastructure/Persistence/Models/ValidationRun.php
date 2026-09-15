<?php

namespace App\Modules\Syllabus\Infrastructure\Persistence\Models;

use App\Support\Database\MapsLegacyColumnNames;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string $id
 * @property string $version_reglas
 * @property int $version_bloqueo
 * @property int $errores_bloqueantes
 * @property int $advertencias
 * @property string $porcentaje_completitud
 * @property CarbonImmutable $completado_en
 */
class ValidationRun extends Model
{
    use HasUuids, MapsLegacyColumnNames;

    protected const LEGACY_COLUMN_ALIASES = [
        'estado' => 'estado_ejecucion_validacion',
        'advertencias' => 'cantidad_advertencias_validacion',
    ];

    public $timestamps = false;

    protected $table = 'ejecuciones_validacion';

    /** @var list<string> */
    protected $fillable = [
        'silabo_id', 'ejecutado_por', 'version_reglas', 'estado', 'version_bloqueo',
        'errores_bloqueantes', 'advertencias', 'porcentaje_completitud', 'completado_en',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'version_bloqueo' => 'integer',
            'errores_bloqueantes' => 'integer',
            'advertencias' => 'integer',
            'porcentaje_completitud' => 'decimal:2',
            'completado_en' => 'immutable_datetime',
        ];
    }

    /** @return HasMany<ValidationResult, $this> */
    public function results(): HasMany
    {
        return $this->hasMany(ValidationResult::class, 'ejecucion_validacion_id');
    }
}
