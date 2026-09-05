<?php

namespace App\Modules\Syllabus\Infrastructure\Persistence\Models;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $silabo_id
 * @property string $usuario_id
 * @property string $asignacion_docente_id
 * @property-read Syllabus $syllabus
 */
class SyllabusCollaborator extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $table = 'colaboradores_silabo';

    /** @var list<string> */
    protected $fillable = ['silabo_id', 'usuario_id', 'asignacion_docente_id'];

    /** @return BelongsTo<Syllabus, $this> */
    public function syllabus(): BelongsTo
    {
        return $this->belongsTo(Syllabus::class, 'silabo_id');
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'usuario_id');
    }

    /** @return BelongsTo<TeacherAssignment, $this> */
    public function teacherAssignment(): BelongsTo
    {
        return $this->belongsTo(TeacherAssignment::class, 'asignacion_docente_id');
    }
}
