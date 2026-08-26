<?php

namespace App\Modules\Syllabus\Infrastructure\Persistence\Models;

use App\Models\User;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Concerns\ImmutableRecord;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * @property string $id
 * @property string $silabo_id
 * @property string $revision_silabo_id
 * @property string $clave_idempotencia
 * @property string $huella_sha256
 * @property string $aprobado_por
 * @property CarbonImmutable $aprobado_en
 * @property-read SyllabusRevision $revision
 */
class Approval extends Model
{
    use HasUuids;
    use ImmutableRecord;

    protected $table = 'aprobaciones';

    /** @var list<string> */
    protected $fillable = [
        'silabo_id', 'revision_silabo_id', 'clave_idempotencia', 'huella_sha256',
        'aprobado_por', 'aprobado_en',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['aprobado_en' => 'immutable_datetime'];
    }

    /** @return BelongsTo<SyllabusRevision, $this> */
    public function revision(): BelongsTo
    {
        return $this->belongsTo(SyllabusRevision::class, 'revision_silabo_id');
    }

    /** @return BelongsTo<User, $this> */
    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'aprobado_por');
    }

    /** @return HasOne<Reopening, $this> */
    public function reopening(): HasOne
    {
        return $this->hasOne(Reopening::class, 'aprobacion_id');
    }
}
