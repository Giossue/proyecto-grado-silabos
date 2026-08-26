<?php

namespace App\Modules\Integrations\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/**
 * @property string $id
 * @property string $ejecucion_importacion_id
 * @property string $item_importacion_id
 * @property string $tipo
 * @property list<string> $candidatos
 * @property string $estado
 * @property string|null $decision
 * @property string|null $justificacion
 */
class ImportConflict extends Model
{
    use HasUuids;

    public const UPDATED_AT = null;

    protected $table = 'conflictos_importacion';

    /** @var list<string> */
    protected $fillable = [
        'ejecucion_importacion_id', 'item_importacion_id', 'tipo', 'candidatos',
        'estado', 'decision', 'justificacion', 'resuelto_por', 'resuelto_en',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['candidatos' => 'array', 'resuelto_en' => 'immutable_datetime'];
    }

    /** @return BelongsTo<ImportExecution, $this> */
    public function execution(): BelongsTo
    {
        return $this->belongsTo(ImportExecution::class, 'ejecucion_importacion_id');
    }

    /** @return BelongsTo<ImportItem, $this> */
    public function item(): BelongsTo
    {
        return $this->belongsTo(ImportItem::class, 'item_importacion_id');
    }

    protected static function booted(): void
    {
        static::updating(function (ImportConflict $conflict): void {
            if ($conflict->getOriginal('estado') === 'resolved') {
                throw new LogicException('Un conflicto de importación resuelto es inmutable.');
            }
        });
        static::deleting(fn () => throw new LogicException('Un conflicto de importación no puede eliminarse.'));
    }
}
