<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * @property string $id
 * @property string|null $codigo_institucional
 * @property string $codigo
 * @property string $nombre
 * @property CarbonImmutable $fecha_inicio
 * @property CarbonImmutable $fecha_fin
 * @property int|null $anio
 * @property bool $activo
 */
class AcademicPeriod extends Model
{
    use HasUuids;

    public const CREATED_AT = 'creado_en';

    public const UPDATED_AT = 'actualizado_en';

    protected $table = 'periodos_academicos';

    /** @var list<string> */
    protected $fillable = [
        'codigo_institucional',
        'codigo',
        'nombre',
        'fecha_inicio',
        'fecha_fin',
        'anio',
        'activo',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'fecha_inicio' => 'immutable_date',
            'fecha_fin' => 'immutable_date',
            'anio' => 'integer',
            'activo' => 'boolean',
        ];
    }
}
