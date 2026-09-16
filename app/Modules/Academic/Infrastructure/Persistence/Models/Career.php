<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use App\Modules\Academic\Domain\StudyModality;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Support\Database\MapsLegacyColumnNames;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string $id
 * @property string $nombre
 * @property string|null $codigo_carrera
 * @property string $facultad_id
 * @property StudyModality|null $modalidad
 * @property string|null $campus_id
 * @property string $codigo_malla
 * @property int $cantidad_ciclos_malla
 * @property bool $activo
 * @property-read Campus|null $campus
 */
class Career extends Model
{
    use HasUuids, MapsLegacyColumnNames;

    protected const LEGACY_COLUMN_ALIASES = [
        'nombre' => 'nombre_carrera',
        'activo' => 'carrera_activa',
        'modalidad' => 'modalidad_carrera',
    ];

    public $timestamps = false;

    protected $table = 'carreras';

    /** @var list<string> */
    protected $fillable = [
        'facultad_id', 'modalidad', 'campus_id', 'codigo_carrera', 'nombre', 'activo',
        'codigo_malla', 'cantidad_ciclos_malla',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'activo' => 'boolean',
            'modalidad' => StudyModality::class,
            'cantidad_ciclos_malla' => 'integer',
        ];
    }

    /** @return BelongsTo<Faculty, $this> */
    public function faculty(): BelongsTo
    {
        return $this->belongsTo(Faculty::class, 'facultad_id');
    }

    /** @return HasMany<CoordinatorAssignment, $this> */
    public function coordinatorAssignments(): HasMany
    {
        return $this->hasMany(CoordinatorAssignment::class, 'carrera_id');
    }

    /** Sede aprobada para la carrera; la heredan sus materias programadas (I-36). */
    /** @return BelongsTo<Campus, $this> */
    public function campus(): BelongsTo
    {
        return $this->belongsTo(Campus::class, 'campus_id');
    }

    /** Materias que forman la estructura curricular única de esta carrera. */
    /** @return HasMany<Subject, $this> */
    public function subjects(): HasMany
    {
        return $this->hasMany(Subject::class, 'carrera_id');
    }

    /** @return HasMany<Syllabus, $this> */
    public function syllabi(): HasMany
    {
        return $this->hasMany(Syllabus::class, 'carrera_id');
    }
}
