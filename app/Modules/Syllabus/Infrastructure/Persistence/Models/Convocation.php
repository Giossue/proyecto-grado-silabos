<?php

namespace App\Modules\Syllabus\Infrastructure\Persistence\Models;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SourceVersion;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateVersion;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string $id
 * @property string $carrera_id
 * @property string $periodo_academico_id
 * @property string $version_plantilla_id
 * @property string $nombre
 * @property string $estado
 * @property string $modo_agrupacion
 * @property CarbonImmutable|null $abierto_en
 * @property-read Career $career
 * @property-read AcademicPeriod $academicPeriod
 * @property-read TemplateVersion $templateVersion
 */
class Convocation extends Model
{
    use HasUuids;

    protected $table = 'convocatorias';

    /** @var list<string> */
    protected $fillable = [
        'carrera_id', 'periodo_academico_id', 'version_plantilla_id', 'nombre', 'estado',
        'modo_agrupacion', 'creado_por', 'abierto_por', 'abierto_en', 'cerrado_en',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['abierto_en' => 'immutable_datetime', 'cerrado_en' => 'immutable_datetime'];
    }

    /** @return BelongsTo<Career, $this> */
    public function career(): BelongsTo
    {
        return $this->belongsTo(Career::class, 'carrera_id');
    }

    /** @return BelongsTo<AcademicPeriod, $this> */
    public function academicPeriod(): BelongsTo
    {
        return $this->belongsTo(AcademicPeriod::class, 'periodo_academico_id');
    }

    /** @return BelongsTo<TemplateVersion, $this> */
    public function templateVersion(): BelongsTo
    {
        return $this->belongsTo(TemplateVersion::class, 'version_plantilla_id');
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'creado_por');
    }

    /** @return BelongsToMany<SourceVersion, $this> */
    public function sourceVersions(): BelongsToMany
    {
        return $this->belongsToMany(SourceVersion::class, 'fuentes_convocatoria', 'convocatoria_id', 'version_fuente_id')
            ->withTimestamps();
    }

    /** @return HasMany<Syllabus, $this> */
    public function syllabi(): HasMany
    {
        return $this->hasMany(Syllabus::class, 'convocatoria_id');
    }

    /** @return HasMany<ConvocationDeadline, $this> */
    public function deadlines(): HasMany
    {
        return $this->hasMany(ConvocationDeadline::class, 'convocatoria_id');
    }
}
