<?php

namespace App\Modules\Syllabus\Infrastructure\Persistence\Models;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string $id
 * @property string $carrera_id
 * @property string $proceso_id
 * @property string $periodo_academico_id
 * @property string $plantilla_id
 * @property string $estado
 * @property CarbonImmutable|null $abierto_en
 * @property-read Career $career
 * @property-read SyllabusProcess $process
 * @property-read AcademicPeriod $academicPeriod
 * @property-read SyllabusTemplate $template
 */
class Convocation extends Model
{
    use HasUuids;

    public const CREATED_AT = 'creado_en';

    public const UPDATED_AT = 'actualizado_en';

    public const STATE_PREPARATION = 'preparacion';

    public const STATE_OPEN = 'abierta';

    public const STATE_PAUSED = 'pausada';

    public const STATE_CLOSED = 'cerrada';

    protected $table = 'convocatorias_carreras';

    /** @var list<string> */
    protected $fillable = [
        'carrera_id', 'proceso_id', 'periodo_academico_id', 'plantilla_id', 'estado',
        'creado_por', 'abierto_por', 'abierto_en', 'cerrado_en',
    ];

    /**
     * En curso: abierta por su carrera y con el proceso institucional abierto. Es la
     * única condición que habilita el trabajo docente y, por lo mismo, la que congela
     * malla y fuentes de la carrera.
     *
     * @param  Builder<Convocation>  $query
     */
    public function scopeRunning(Builder $query): void
    {
        $query->where('estado', self::STATE_OPEN)
            ->whereHas('process', fn (Builder $process) => $process->where('estado', SyllabusProcess::STATE_OPEN));
    }

    public function isRunning(): bool
    {
        return $this->estado === self::STATE_OPEN
            && $this->process()->value('estado') === SyllabusProcess::STATE_OPEN;
    }

    /** @return BelongsTo<SyllabusProcess, $this> */
    public function process(): BelongsTo
    {
        return $this->belongsTo(SyllabusProcess::class, 'proceso_id');
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['abierto_en' => 'immutable_datetime', 'cerrado_en' => 'immutable_datetime'];
    }

    protected function nombre(): Attribute
    {
        return Attribute::get(function (): string {
            $career = $this->relationLoaded('career')
                ? $this->career?->nombre
                : $this->career()->value('nombre');
            $period = $this->relationLoaded('academicPeriod')
                ? $this->academicPeriod?->nombre
                : $this->academicPeriod()->value('nombre');

            return trim(($career ?? 'Carrera').' · '.($period ?? 'Período'));
        });
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

    /** @return BelongsTo<SyllabusTemplate, $this> */
    public function template(): BelongsTo
    {
        return $this->belongsTo(SyllabusTemplate::class, 'plantilla_id');
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'creado_por');
    }

    /** @return BelongsToMany<AcademicSource, $this> */
    public function sources(): BelongsToMany
    {
        return $this->belongsToMany(AcademicSource::class, 'fuentes_convocatoria', 'convocatoria_id', 'fuente_academica_id')
            ->withTimestamps('creado_en', 'actualizado_en');
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
