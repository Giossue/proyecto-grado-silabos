<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use App\Modules\Academic\Domain\StudyModality;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id
 * @property string $nombre
 * @property string|null $codigo_institucional
 * @property string $facultad_id
 * @property StudyModality|null $modalidad
 * @property string|null $campus_id
 * @property bool $activo
 * @property-read Campus|null $campus
 */
class Career extends Model
{
    use HasUuids;

    public const CREATED_AT = 'creado_en';

    public const UPDATED_AT = 'actualizado_en';

    protected $table = 'carreras';

    /** @var list<string> */
    protected $fillable = ['facultad_id', 'escuela_id', 'modalidad', 'campus_id', 'codigo_institucional', 'nombre', 'activo'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['activo' => 'boolean', 'modalidad' => StudyModality::class];
    }

    /** @return BelongsTo<Faculty, $this> */
    public function faculty(): BelongsTo
    {
        return $this->belongsTo(Faculty::class, 'facultad_id');
    }

    /** Sede aprobada para la carrera; la heredan sus ofertas (I-36). */
    /** @return BelongsTo<Campus, $this> */
    public function campus(): BelongsTo
    {
        return $this->belongsTo(Campus::class, 'campus_id');
    }

    /** @return BelongsTo<School, $this> */
    public function school(): BelongsTo
    {
        return $this->belongsTo(School::class, 'escuela_id');
    }
}
