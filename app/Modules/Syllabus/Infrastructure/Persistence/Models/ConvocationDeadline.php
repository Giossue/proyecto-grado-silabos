<?php

namespace App\Modules\Syllabus\Infrastructure\Persistence\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id
 * @property string $convocatoria_id
 * @property string $etapa
 * @property CarbonImmutable $vence_en
 */
class ConvocationDeadline extends Model
{
    use HasUuids;

    public const CREATED_AT = 'creado_en';

    public const UPDATED_AT = 'actualizado_en';

    protected $table = 'fechas_limite_convocatoria';

    /** @var list<string> */
    protected $fillable = ['convocatoria_id', 'etapa', 'vence_en'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['vence_en' => 'immutable_datetime'];
    }

    /** @return BelongsTo<Convocation, $this> */
    public function convocation(): BelongsTo
    {
        return $this->belongsTo(Convocation::class, 'convocatoria_id');
    }
}
