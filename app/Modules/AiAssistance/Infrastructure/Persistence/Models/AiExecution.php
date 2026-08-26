<?php

namespace App\Modules\AiAssistance\Infrastructure\Persistence\Models;

use App\Models\User;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Operations\Infrastructure\Persistence\Models\JobExecution;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use LogicException;

/**
 * @property string $id
 * @property string $silabo_id
 * @property string $definicion_campo_id
 * @property string $version_plantilla_id
 * @property string|null $ejecucion_trabajo_id
 * @property string $clave_idempotencia
 * @property string $clave_funcional
 * @property string $estado
 * @property string $version_contrato
 * @property string $version_instruccion
 * @property string $version_gateway_solicitada
 * @property string|null $version_gateway_ejecutada
 * @property string $locale
 * @property string $contenido_entrada
 * @property string $huella_contenido
 * @property string $huella_conjunto_fuentes
 * @property array<string, mixed> $metadatos_entrada
 * @property int $lock_version_origen
 * @property string|null $motivo_no_concluyente
 * @property string|null $codigo_error
 * @property string|null $mensaje_error
 * @property string $solicitado_por
 * @property CarbonImmutable $solicitado_en
 * @property CarbonImmutable|null $iniciado_en
 * @property CarbonImmutable|null $completado_en
 * @property-read Syllabus $syllabus
 * @property-read FieldDefinition $field
 */
class AiExecution extends Model
{
    use HasUuids;

    protected $table = 'ejecuciones_ia';

    /** @var list<string> */
    protected $fillable = [
        'silabo_id', 'definicion_campo_id', 'version_plantilla_id', 'ejecucion_trabajo_id',
        'clave_idempotencia', 'clave_funcional', 'estado', 'version_contrato',
        'version_instruccion', 'version_gateway_solicitada', 'version_gateway_ejecutada',
        'locale', 'contenido_entrada', 'huella_contenido', 'huella_conjunto_fuentes',
        'metadatos_entrada', 'lock_version_origen', 'motivo_no_concluyente', 'codigo_error',
        'mensaje_error', 'solicitado_por', 'asignacion_rol_id', 'solicitado_en',
        'iniciado_en', 'completado_en',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'metadatos_entrada' => 'array',
            'lock_version_origen' => 'integer',
            'solicitado_en' => 'immutable_datetime',
            'iniciado_en' => 'immutable_datetime',
            'completado_en' => 'immutable_datetime',
        ];
    }

    /** @return BelongsTo<Syllabus, $this> */
    public function syllabus(): BelongsTo
    {
        return $this->belongsTo(Syllabus::class, 'silabo_id');
    }

    /** @return BelongsTo<FieldDefinition, $this> */
    public function field(): BelongsTo
    {
        return $this->belongsTo(FieldDefinition::class, 'definicion_campo_id');
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

    /** @return HasMany<AiEvidence, $this> */
    public function evidence(): HasMany
    {
        return $this->hasMany(AiEvidence::class, 'ejecucion_ia_id');
    }

    /** @return HasMany<AiRecommendation, $this> */
    public function recommendations(): HasMany
    {
        return $this->hasMany(AiRecommendation::class, 'ejecucion_ia_id')->orderBy('ordinal');
    }

    protected static function booted(): void
    {
        static::updating(function (AiExecution $execution): void {
            if (in_array($execution->getOriginal('estado'), ['completed', 'inconclusive', 'failed'], true)) {
                throw new LogicException('Una ejecución de IA terminal es inmutable.');
            }
        });
        static::deleting(fn () => throw new LogicException('Una ejecución de IA no puede eliminarse.'));
    }
}
