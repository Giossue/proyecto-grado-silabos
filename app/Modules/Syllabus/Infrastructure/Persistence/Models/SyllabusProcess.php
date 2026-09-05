<?php

namespace App\Modules\Syllabus\Infrastructure\Persistence\Models;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Configuration\Infrastructure\Persistence\Models\SyllabusTemplate;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Proceso institucional de elaboración de sílabos: el calendario que obliga a todas las
 * carreras. Fija la plantilla y las fechas; cada convocatoria de carrera cuelga de él.
 *
 * @property string $id
 * @property string $plantilla_id
 * @property string $periodo_academico_id
 * @property CarbonImmutable $inicia_en
 * @property CarbonImmutable $entrega_en
 * @property string $estado
 * @property string $creado_por
 * @property string|null $abierto_por
 * @property CarbonImmutable|null $abierto_en
 * @property CarbonImmutable|null $pausado_en
 * @property CarbonImmutable|null $cerrado_en
 * @property-read SyllabusTemplate $template
 */
class SyllabusProcess extends Model
{
    use HasUuids;

    public const CREATED_AT = 'creado_en';

    public const UPDATED_AT = 'actualizado_en';

    public const STATE_PREPARATION = 'preparacion';

    public const STATE_OPEN = 'abierto';

    public const STATE_PAUSED = 'pausado';

    public const STATE_CLOSED = 'cerrado';

    /** @var list<string> */
    public const STATES = [
        self::STATE_PREPARATION,
        self::STATE_OPEN,
        self::STATE_PAUSED,
        self::STATE_CLOSED,
    ];

    protected $table = 'convocatorias_universidad';

    /** @var list<string> */
    protected $fillable = [
        'plantilla_id', 'periodo_academico_id', 'inicia_en', 'entrega_en', 'estado',
        'creado_por', 'abierto_por', 'abierto_en', 'pausado_en', 'cerrado_en',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'inicia_en' => 'immutable_datetime',
            'entrega_en' => 'immutable_datetime',
            'abierto_en' => 'immutable_datetime',
            'pausado_en' => 'immutable_datetime',
            'cerrado_en' => 'immutable_datetime',
        ];
    }

    protected function nombre(): Attribute
    {
        return Attribute::get(fn (): string => $this->relationLoaded('academicPeriod')
            ? ($this->academicPeriod?->nombre ?? 'Período')
            : ($this->academicPeriod()->value('nombre') ?? 'Período'));
    }

    /**
     * Abierto o pausado: ocupa el único lugar de proceso vigente.
     *
     * @param  Builder<SyllabusProcess>  $query
     */
    public function scopeInProgress(Builder $query): void
    {
        $query->whereIn('estado', [self::STATE_OPEN, self::STATE_PAUSED]);
    }

    public function isOpen(): bool
    {
        return $this->estado === self::STATE_OPEN;
    }

    /** Solo se reconfigura lo que no está corriendo: antes de abrir o durante una pausa. */
    public function isConfigurable(): bool
    {
        return in_array($this->estado, [self::STATE_PREPARATION, self::STATE_PAUSED], true);
    }

    /** @return BelongsTo<SyllabusTemplate, $this> */
    public function template(): BelongsTo
    {
        return $this->belongsTo(SyllabusTemplate::class, 'plantilla_id');
    }

    /** @return BelongsTo<AcademicPeriod, $this> */
    public function academicPeriod(): BelongsTo
    {
        return $this->belongsTo(AcademicPeriod::class, 'periodo_academico_id');
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'creado_por');
    }

    /** @return HasMany<Convocation, $this> */
    public function convocations(): HasMany
    {
        return $this->hasMany(Convocation::class, 'proceso_id');
    }
}
