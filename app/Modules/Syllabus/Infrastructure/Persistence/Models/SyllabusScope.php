<?php

namespace App\Modules\Syllabus\Infrastructure\Persistence\Models;

use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\ScheduledSubject;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SyllabusScope extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $table = 'alcances_silabo';

    /** @var list<string> */
    protected $fillable = ['silabo_id', 'convocatoria_id', 'programacion_asignatura_id', 'paralelo_id'];

    /** @return BelongsTo<ScheduledSubject, $this> */
    public function scheduledSubject(): BelongsTo
    {
        return $this->belongsTo(ScheduledSubject::class, 'programacion_asignatura_id');
    }

    /** @return BelongsTo<Parallel, $this> */
    public function parallel(): BelongsTo
    {
        return $this->belongsTo(Parallel::class, 'paralelo_id');
    }
}
