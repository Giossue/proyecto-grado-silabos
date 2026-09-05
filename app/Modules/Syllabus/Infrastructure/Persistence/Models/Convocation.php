<?php

namespace App\Modules\Syllabus\Infrastructure\Persistence\Models;

use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Configuration\Infrastructure\Persistence\Models\AcademicSource;
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
 * @property string $estado
 * @property-read string $nombre
 * @property-read Career $career
 * @property-read SyllabusProcess $process
 */
class Convocation extends Model
{
    use HasUuids;

    public $timestamps = false;

    public const STATE_PREPARATION = 'preparacion';

    public const STATE_OPEN = 'abierta';

    public const STATE_PAUSED = 'pausada';

    public const STATE_CLOSED = 'cerrada';

    protected $table = 'convocatorias_carreras';

    /** @var list<string> */
    protected $fillable = [
        'carrera_id', 'proceso_id', 'estado',
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

    /** @return Attribute<string, never> */
    protected function nombre(): Attribute
    {
        return Attribute::get(function (): string {
            $career = $this->relationLoaded('career')
                ? $this->career->nombre
                : $this->career()->value('nombre');
            $process = $this->relationLoaded('process')
                ? $this->process
                : $this->process()->with('academicPeriod:id,nombre')->firstOrFail();
            $period = $process->relationLoaded('academicPeriod')
                ? $process->academicPeriod->nombre
                : $process->academicPeriod()->value('nombre');

            return trim(($career ?? 'Carrera').' · '.($period ?? 'Período'));
        });
    }

    /** @return BelongsTo<Career, $this> */
    public function career(): BelongsTo
    {
        return $this->belongsTo(Career::class, 'carrera_id');
    }

    /** @return BelongsToMany<AcademicSource, $this> */
    public function sources(): BelongsToMany
    {
        return $this->belongsToMany(AcademicSource::class, 'fuentes_convocatoria', 'convocatoria_id', 'fuente_academica_id')
            ->withPivot('id');
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
