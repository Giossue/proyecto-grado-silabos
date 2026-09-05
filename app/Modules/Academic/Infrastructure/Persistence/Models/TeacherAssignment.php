<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id
 * @property string|null $sustento_tipo
 * @property string|null $sustento_numero
 * @property bool $activo
 * @property-read User $user
 * @property-read Parallel $parallel
 */
class TeacherAssignment extends Model
{
    use HasUuids;

    public const CREATED_AT = 'creado_en';

    public const UPDATED_AT = 'actualizado_en';

    protected $table = 'asignaciones_docente';

    /** @var list<string> */
    protected $fillable = [
        'usuario_id',
        'paralelo_id',
        'activo',
        'sustento_tipo',
        'sustento_numero',
        'sustento_fecha',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'activo' => 'boolean',
            'sustento_fecha' => 'immutable_date',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'usuario_id');
    }

    /** @return BelongsTo<Parallel, $this> */
    public function parallel(): BelongsTo
    {
        return $this->belongsTo(Parallel::class, 'paralelo_id');
    }
}
