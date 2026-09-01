<?php

namespace App\Modules\Syllabus\Infrastructure\Persistence\Models;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use LogicException;

/**
 * @property string $id
 * @property string $revision_silabo_id
 * @property string|null $clave_seccion
 * @property string|null $clave_campo
 * @property string $contenido
 * @property string $estado
 * @property string $creado_por
 * @property CarbonImmutable $creado_en
 */
class ReviewObservation extends Model
{
    use HasUuids;

    public const CREATED_AT = 'registrado_en';

    public const UPDATED_AT = 'actualizado_en';

    protected $table = 'observaciones_revision';

    /** @var list<string> */
    protected $fillable = [
        'revision_silabo_id', 'clave_seccion', 'clave_campo', 'contenido',
        'estado', 'creado_por', 'creado_en',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['creado_en' => 'immutable_datetime'];
    }

    /** @return BelongsTo<SyllabusRevision, $this> */
    public function revision(): BelongsTo
    {
        return $this->belongsTo(SyllabusRevision::class, 'revision_silabo_id');
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'creado_por');
    }

    /** @return HasOne<ObservationResponse, $this> */
    public function response(): HasOne
    {
        return $this->hasOne(ObservationResponse::class, 'observacion_revision_id');
    }

    protected static function booted(): void
    {
        static::updating(function (ReviewObservation $observation): void {
            if (array_diff(array_keys($observation->getDirty()), ['estado', 'actualizado_en']) !== []) {
                throw new LogicException('El contenido de una observación es inmutable.');
            }
        });
        static::deleting(fn () => throw new LogicException('Una observación histórica no puede eliminarse.'));
    }
}
