<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use App\Support\Database\MapsLegacyColumnNames;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * @property string $id
 * @property string $codigo
 * @property CarbonImmutable $fecha_inicio
 * @property CarbonImmutable $fecha_fin
 * @property int $semanas_lectivas
 */
class AcademicPeriod extends Model
{
    use HasUuids, MapsLegacyColumnNames;

    protected const LEGACY_COLUMN_ALIASES = [
        'codigo' => 'codigo_periodo_academico',
        'fecha_inicio' => 'fecha_inicio_periodo',
        'fecha_fin' => 'fecha_fin_periodo',
        'semanas_lectivas' => 'cantidad_semanas_lectivas',
    ];

    public $timestamps = false;

    protected $table = 'periodos_academicos';

    /** @var list<string> */
    protected $fillable = [
        'codigo',
        'fecha_inicio',
        'fecha_fin',
        'semanas_lectivas',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'fecha_inicio' => 'immutable_date',
            'fecha_fin' => 'immutable_date',
            'semanas_lectivas' => 'integer',
        ];
    }
}
