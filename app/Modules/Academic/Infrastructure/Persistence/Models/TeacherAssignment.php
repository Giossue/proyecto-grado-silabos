<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id
 * @property CarbonImmutable $vigente_desde
 * @property CarbonImmutable|null $vigente_hasta
 * @property string|null $codigo_institucional
 * @property string|null $sustento_tipo
 * @property string|null $sustento_numero
 * @property bool $activo
 * @property-read User $user
 * @property-read Parallel $parallel
 */
class TeacherAssignment extends Model
{
    use HasUuids;

    protected $table = 'asignaciones_docente';

    /** @var list<string> */
    protected $fillable = [
        'usuario_id',
        'paralelo_id',
        'codigo_institucional',
        'vigente_desde',
        'vigente_hasta',
        'activo',
        'sustento_tipo',
        'sustento_numero',
        'sustento_fecha',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'vigente_desde' => 'immutable_datetime',
            'vigente_hasta' => 'immutable_datetime',
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
