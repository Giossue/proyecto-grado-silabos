<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id
 * @property string $asignatura_id
 * @property string $definicion_campo_id
 * @property mixed $valor
 */
class SubjectFieldValue extends Model
{
    use HasUuids;

    protected $table = 'valores_campo_asignatura';

    /** @var list<string> */
    protected $fillable = ['asignatura_id', 'definicion_campo_id', 'valor'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['valor' => 'json'];
    }

    /** @return BelongsTo<Subject, $this> */
    public function subject(): BelongsTo
    {
        return $this->belongsTo(Subject::class, 'asignatura_id');
    }

    /** @return BelongsTo<CurriculumFieldDefinition, $this> */
    public function definition(): BelongsTo
    {
        return $this->belongsTo(CurriculumFieldDefinition::class, 'definicion_campo_id');
    }
}
