<?php

namespace App\Modules\Syllabus\Infrastructure\Persistence\Models;

use App\Models\User;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Concerns\ImmutableRecord;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * @property string $id
 * @property string $justificacion
 * @property CarbonImmutable $solicitado_en
 */
class CorrectionRequest extends Model
{
    use HasUuids;
    use ImmutableRecord;

    public const CREATED_AT = 'creado_en';

    public const UPDATED_AT = 'actualizado_en';

    protected $table = 'solicitudes_correccion';

    /** @var list<string> */
    protected $fillable = ['silabo_id', 'revision_silabo_id', 'justificacion', 'solicitado_por', 'solicitado_en'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['solicitado_en' => 'immutable_datetime'];
    }

    /** @return BelongsTo<SyllabusRevision, $this> */
    public function revision(): BelongsTo
    {
        return $this->belongsTo(SyllabusRevision::class, 'revision_silabo_id');
    }

    /** @return BelongsTo<User, $this> */
    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'solicitado_por');
    }

    /** @return BelongsToMany<ReviewObservation, $this> */
    public function observations(): BelongsToMany
    {
        return $this->belongsToMany(
            ReviewObservation::class,
            'solicitud_correccion_observaciones',
            'solicitud_correccion_id',
            'observacion_revision_id',
        );
    }
}
