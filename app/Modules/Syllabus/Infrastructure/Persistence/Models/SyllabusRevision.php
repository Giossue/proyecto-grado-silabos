<?php

namespace App\Modules\Syllabus\Infrastructure\Persistence\Models;

use App\Models\User;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Concerns\ImmutableRecord;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * @property string $id
 * @property string $silabo_id
 * @property string|null $revision_anterior_id
 * @property string|null $reapertura_id
 * @property int $numero_revision
 * @property string $clave_idempotencia
 * @property int $lock_version_origen
 * @property array<string, mixed> $snapshot
 * @property string $huella_sha256
 * @property string $enviado_por
 * @property CarbonImmutable $enviado_en
 * @property-read Syllabus $syllabus
 */
class SyllabusRevision extends Model
{
    use HasUuids;
    use ImmutableRecord;

    protected $table = 'revisiones_silabo';

    /** @var list<string> */
    protected $fillable = [
        'silabo_id', 'revision_anterior_id', 'reapertura_id', 'numero_revision',
        'clave_idempotencia', 'lock_version_origen', 'snapshot', 'huella_sha256',
        'enviado_por', 'enviado_en',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'numero_revision' => 'integer',
            'lock_version_origen' => 'integer',
            'snapshot' => 'array',
            'enviado_en' => 'immutable_datetime',
        ];
    }

    /** @return BelongsTo<Syllabus, $this> */
    public function syllabus(): BelongsTo
    {
        return $this->belongsTo(Syllabus::class, 'silabo_id');
    }

    /** @return BelongsTo<SyllabusRevision, $this> */
    public function previousRevision(): BelongsTo
    {
        return $this->belongsTo(self::class, 'revision_anterior_id');
    }

    /** @return BelongsTo<Reopening, $this> */
    public function reopening(): BelongsTo
    {
        return $this->belongsTo(Reopening::class, 'reapertura_id');
    }

    /** @return BelongsTo<User, $this> */
    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'enviado_por');
    }

    /** @return HasMany<ReviewObservation, $this> */
    public function observations(): HasMany
    {
        return $this->hasMany(ReviewObservation::class, 'revision_silabo_id');
    }

    /** @return HasOne<Approval, $this> */
    public function approval(): HasOne
    {
        return $this->hasOne(Approval::class, 'revision_silabo_id');
    }

    /** @return HasOne<CorrectionRequest, $this> */
    public function correctionRequest(): HasOne
    {
        return $this->hasOne(CorrectionRequest::class, 'revision_silabo_id');
    }
}
