<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use App\Modules\Academic\Domain\StudyModality;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string $id
 * @property bool $activo
 * @property int $parallels_count
 * @property-read AcademicPeriod $academicPeriod
 * @property-read Subject $subject
 * @property-read Campus $campus
 * @property StudyModality $modalidad
 */
class CourseOffering extends Model
{
    use HasUuids;

    public const CREATED_AT = 'creado_en';

    public const UPDATED_AT = 'actualizado_en';

    protected $table = 'ofertas_academicas';

    /** @var list<string> */
    protected $fillable = ['periodo_academico_id', 'asignatura_id', 'campus_id', 'modalidad', 'activo'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['activo' => 'boolean', 'modalidad' => StudyModality::class];
    }

    /** @return BelongsTo<AcademicPeriod, $this> */
    public function academicPeriod(): BelongsTo
    {
        return $this->belongsTo(AcademicPeriod::class, 'periodo_academico_id');
    }

    /** @return BelongsTo<Subject, $this> */
    public function subject(): BelongsTo
    {
        return $this->belongsTo(Subject::class, 'asignatura_id');
    }

    /** @return BelongsTo<Campus, $this> */
    public function campus(): BelongsTo
    {
        return $this->belongsTo(Campus::class, 'campus_id');
    }

    /** @return HasMany<Parallel, $this> */
    public function parallels(): HasMany
    {
        return $this->hasMany(Parallel::class, 'oferta_academica_id');
    }
}
