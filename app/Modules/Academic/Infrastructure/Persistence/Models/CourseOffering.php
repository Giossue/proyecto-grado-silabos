<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

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
 * @property-read Modality $modality
 */
class CourseOffering extends Model
{
    use HasUuids;

    public const CREATED_AT = 'creado_en';

    public const UPDATED_AT = 'actualizado_en';

    protected $table = 'ofertas_academicas';

    /** @var list<string> */
    protected $fillable = ['periodo_academico_id', 'asignatura_id', 'campus_id', 'modalidad_id', 'activo'];

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

    /** @return BelongsTo<Modality, $this> */
    public function modality(): BelongsTo
    {
        return $this->belongsTo(Modality::class, 'modalidad_id');
    }

    /** @return HasMany<Parallel, $this> */
    public function parallels(): HasMany
    {
        return $this->hasMany(Parallel::class, 'oferta_academica_id');
    }
}
