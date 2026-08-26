<?php

namespace App\Modules\Integrations\Infrastructure\Persistence\Models;

use App\Models\User;
use App\Modules\Operations\Infrastructure\Persistence\Models\JobExecution;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use LogicException;

/**
 * @property string $id
 * @property string|null $ejecucion_trabajo_id
 * @property string $origen
 * @property string $perfil
 * @property string $modo
 * @property string $version_contrato
 * @property string $version_lector_solicitada
 * @property string|null $version_lector_ejecutada
 * @property string $version_mapper
 * @property string $version_reconciliador
 * @property string $clave_idempotencia
 * @property string $estado
 * @property array<string, mixed> $parametros
 * @property string|null $huella_entrada
 * @property int $total_items
 * @property int $items_validos
 * @property int $items_rechazados
 * @property int $conflictos
 * @property int $altas_propuestas
 * @property int $cambios_propuestos
 * @property int $sin_cambio_propuesto
 * @property string|null $codigo_error
 * @property string|null $mensaje_error
 * @property string $solicitado_por
 * @property CarbonImmutable $solicitado_en
 * @property CarbonImmutable|null $iniciado_en
 * @property CarbonImmutable|null $completado_en
 */
class ImportExecution extends Model
{
    use HasUuids;

    protected $table = 'ejecuciones_importacion';

    /** @var list<string> */
    protected $fillable = [
        'ejecucion_trabajo_id', 'origen', 'perfil', 'modo', 'version_contrato',
        'version_lector_solicitada', 'version_lector_ejecutada', 'version_mapper',
        'version_reconciliador', 'clave_idempotencia', 'estado', 'parametros',
        'huella_entrada', 'total_items', 'items_validos', 'items_rechazados',
        'conflictos', 'altas_propuestas', 'cambios_propuestos', 'sin_cambio_propuesto',
        'codigo_error', 'mensaje_error', 'solicitado_por', 'asignacion_rol_id',
        'solicitado_en', 'iniciado_en', 'completado_en',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'parametros' => 'array',
            'total_items' => 'integer',
            'items_validos' => 'integer',
            'items_rechazados' => 'integer',
            'conflictos' => 'integer',
            'altas_propuestas' => 'integer',
            'cambios_propuestos' => 'integer',
            'sin_cambio_propuesto' => 'integer',
            'solicitado_en' => 'immutable_datetime',
            'iniciado_en' => 'immutable_datetime',
            'completado_en' => 'immutable_datetime',
        ];
    }

    /** @return BelongsTo<JobExecution, $this> */
    public function jobExecution(): BelongsTo
    {
        return $this->belongsTo(JobExecution::class, 'ejecucion_trabajo_id');
    }

    /** @return BelongsTo<User, $this> */
    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'solicitado_por');
    }

    /** @return HasMany<ImportItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(ImportItem::class, 'ejecucion_importacion_id')->orderBy('numero_fila');
    }

    /** @return HasMany<ImportConflict, $this> */
    public function conflicts(): HasMany
    {
        return $this->hasMany(ImportConflict::class, 'ejecucion_importacion_id');
    }

    protected static function booted(): void
    {
        static::updating(function (ImportExecution $execution): void {
            if (in_array($execution->getOriginal('estado'), ['completed', 'failed'], true)) {
                throw new LogicException('Una ejecución de importación terminal es inmutable.');
            }
        });
        static::deleting(fn () => throw new LogicException('Una ejecución de importación no puede eliminarse.'));
    }
}
