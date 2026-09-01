<?php

namespace App\Modules\AiAssistance\Infrastructure\Persistence\Models;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Concerns\ImmutableRecord;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string $id
 * @property string $ejecucion_ia_id
 * @property string $definicion_campo_id
 * @property int $ordinal
 * @property string $tipo
 * @property string $titulo
 * @property string $explicacion
 * @property string $texto_sugerido
 * @property-read AiExecution $execution
 */
class AiRecommendation extends Model
{
    use HasUuids, ImmutableRecord;

    public const CREATED_AT = 'creado_en';

    public const UPDATED_AT = null;

    protected $table = 'recomendaciones_ia';

    /** @var list<string> */
    protected $fillable = [
        'ejecucion_ia_id', 'definicion_campo_id', 'ordinal', 'tipo', 'titulo',
        'explicacion', 'texto_sugerido',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['ordinal' => 'integer'];
    }

    /** @return BelongsTo<AiExecution, $this> */
    public function execution(): BelongsTo
    {
        return $this->belongsTo(AiExecution::class, 'ejecucion_ia_id');
    }

    /** @return BelongsToMany<AiEvidence, $this> */
    public function evidence(): BelongsToMany
    {
        return $this->belongsToMany(
            AiEvidence::class,
            'recomendacion_evidencias_ia',
            'recomendacion_ia_id',
            'evidencia_ia_id',
        );
    }

    /** @return HasMany<AiFeedback, $this> */
    public function feedback(): HasMany
    {
        return $this->hasMany(AiFeedback::class, 'recomendacion_ia_id');
    }
}
