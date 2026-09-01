<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id
 * @property string|null $carrera_id
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
        'carrera_id',
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

    /**
     * Un periodo sin carrera es un catálogo institucional global; con carrera reproduce
     * la fuente, donde `periodo_lectivo.cod_carr` es obligatorio y el mismo nombre de
     * periodo se repite una vez por carrera con fechas propias.
     *
     * @return BelongsTo<Career, $this>
     */
    public function career(): BelongsTo
    {
        return $this->belongsTo(Career::class, 'carrera_id');
    }
}
