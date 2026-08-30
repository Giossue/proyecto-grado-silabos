<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id
 * @property string $asignatura_id
 * @property string $requisito_id
 * @property string $tipo
 */
class SubjectRequirement extends Model
{
    use HasUuids;

    protected $table = 'requisitos_asignatura';

    /** @var list<string> */
    protected $fillable = ['asignatura_id', 'requisito_id', 'tipo'];

    /** @return BelongsTo<Subject, $this> */
    public function subject(): BelongsTo
    {
        return $this->belongsTo(Subject::class, 'asignatura_id');
    }

    /** @return BelongsTo<Subject, $this> */
    public function requirement(): BelongsTo
    {
        return $this->belongsTo(Subject::class, 'requisito_id');
    }
}
