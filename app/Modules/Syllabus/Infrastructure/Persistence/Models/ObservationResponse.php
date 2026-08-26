<?php

namespace App\Modules\Syllabus\Infrastructure\Persistence\Models;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/**
 * @property string $id
 * @property string $silabo_id
 * @property string $observacion_revision_id
 * @property string|null $revision_respuesta_id
 * @property string $contenido
 * @property string $respondido_por
 * @property CarbonImmutable $respondido_en
 */
class ObservationResponse extends Model
{
    use HasUuids;

    protected $table = 'respuestas_observacion';

    /** @var list<string> */
    protected $fillable = [
        'silabo_id', 'observacion_revision_id', 'revision_respuesta_id',
        'contenido', 'respondido_por', 'respondido_en',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['respondido_en' => 'immutable_datetime'];
    }

    /** @return BelongsTo<ReviewObservation, $this> */
    public function observation(): BelongsTo
    {
        return $this->belongsTo(ReviewObservation::class, 'observacion_revision_id');
    }

    /** @return BelongsTo<SyllabusRevision, $this> */
    public function responseRevision(): BelongsTo
    {
        return $this->belongsTo(SyllabusRevision::class, 'revision_respuesta_id');
    }

    /** @return BelongsTo<User, $this> */
    public function respondent(): BelongsTo
    {
        return $this->belongsTo(User::class, 'respondido_por');
    }

    protected static function booted(): void
    {
        static::updating(function (ObservationResponse $response): void {
            if ($response->getOriginal('revision_respuesta_id') !== null) {
                throw new LogicException('Una respuesta enviada es inmutable.');
            }
        });
        static::deleting(fn () => throw new LogicException('Una respuesta histórica no puede eliminarse.'));
    }
}
