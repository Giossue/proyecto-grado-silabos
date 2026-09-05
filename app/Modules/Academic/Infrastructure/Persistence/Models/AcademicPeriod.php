<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * @property string $id
 * @property string $codigo
 * @property string $nombre
 * @property CarbonImmutable $fecha_inicio
 * @property CarbonImmutable $fecha_fin
 * @property bool $activo
 */
class AcademicPeriod extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $table = 'periodos_academicos';

    /** @var list<string> */
    protected $fillable = [
        'codigo',
        'nombre',
        'fecha_inicio',
        'fecha_fin',
        'activo',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'fecha_inicio' => 'immutable_date',
            'fecha_fin' => 'immutable_date',
            'activo' => 'boolean',
        ];
    }
}
