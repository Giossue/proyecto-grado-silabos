<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string $id
 * @property string $codigo
 * @property string|null $jornada
 * @property bool $activo
 * @property-read ScheduledSubject $scheduledSubject
 */
class Parallel extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $table = 'paralelos';

    /** @var list<string> */
    /** Jornadas del formato oficial del sílabo. */
    public const SHIFTS = ['matutina', 'vespertina', 'nocturna'];

    /** @var list<string> */
    protected $fillable = ['programacion_asignatura_id', 'codigo', 'jornada', 'activo'];

    /** @return BelongsTo<ScheduledSubject, $this> */
    public function scheduledSubject(): BelongsTo
    {
        return $this->belongsTo(ScheduledSubject::class, 'programacion_asignatura_id');
    }

    /** @return HasMany<TeacherAssignment, $this> */
    public function teacherAssignments(): HasMany
    {
        return $this->hasMany(TeacherAssignment::class, 'paralelo_id');
    }
}
