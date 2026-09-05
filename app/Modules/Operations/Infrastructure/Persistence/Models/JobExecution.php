<?php

namespace App\Modules\Operations\Infrastructure\Persistence\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * @property string $id
 * @property string $tipo
 * @property string $cola
 * @property string $estado
 * @property string $clave_idempotencia
 * @property string|null $correlacion_id
 * @property string|null $tipo_recurso
 * @property string|null $recurso_id
 * @property int $intentos
 * @property int $intentos_maximos
 * @property int $progreso
 * @property array<string, mixed>|null $resultado
 * @property string|null $codigo_error
 * @property string|null $mensaje_error
 * @property CarbonImmutable|null $iniciado_en
 * @property CarbonImmutable|null $finalizado_en
 * @property CarbonImmutable|null $encolado_en
 */
class JobExecution extends Model
{
    use HasUuids;

    public const CREATED_AT = 'encolado_en';

    public const UPDATED_AT = null;

    protected $table = 'ejecuciones_trabajo';

    /** @var list<string> */
    protected $fillable = [
        'tipo',
        'cola',
        'estado',
        'clave_idempotencia',
        'correlacion_id',
        'tipo_recurso',
        'recurso_id',
        'intentos',
        'intentos_maximos',
        'progreso',
        'resultado',
        'codigo_error',
        'mensaje_error',
        'iniciado_en',
        'finalizado_en',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'intentos' => 'integer',
            'intentos_maximos' => 'integer',
            'progreso' => 'integer',
            'resultado' => 'array',
            'iniciado_en' => 'immutable_datetime',
            'finalizado_en' => 'immutable_datetime',
            'encolado_en' => 'immutable_datetime',
        ];
    }
}
