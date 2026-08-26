<?php

namespace App\Modules\Integrations\Infrastructure\Persistence\Models;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Concerns\ImmutableRecord;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * @property string $id
 * @property string $ejecucion_importacion_id
 * @property int $numero_fila
 * @property string $referencia_externa
 * @property string $tipo_entidad
 * @property array<string, mixed> $payload_original
 * @property string $huella_original
 * @property array<string, bool|float|int|string>|null $payload_normalizado
 * @property string|null $huella_normalizada
 * @property string $resultado
 * @property string|null $accion_propuesta
 * @property string $codigo_motivo
 * @property string|null $tipo_candidato
 * @property string|null $candidato_id
 */
class ImportItem extends Model
{
    use HasUuids, ImmutableRecord;

    public const UPDATED_AT = null;

    protected $table = 'items_importacion';

    /** @var list<string> */
    protected $fillable = [
        'ejecucion_importacion_id', 'numero_fila', 'referencia_externa', 'tipo_entidad',
        'payload_original', 'huella_original', 'payload_normalizado', 'huella_normalizada',
        'resultado', 'accion_propuesta', 'codigo_motivo', 'tipo_candidato', 'candidato_id',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'numero_fila' => 'integer',
            'payload_original' => 'array',
            'payload_normalizado' => 'array',
        ];
    }

    /** @return BelongsTo<ImportExecution, $this> */
    public function execution(): BelongsTo
    {
        return $this->belongsTo(ImportExecution::class, 'ejecucion_importacion_id');
    }

    /** @return HasOne<ImportConflict, $this> */
    public function conflict(): HasOne
    {
        return $this->hasOne(ImportConflict::class, 'item_importacion_id');
    }
}
