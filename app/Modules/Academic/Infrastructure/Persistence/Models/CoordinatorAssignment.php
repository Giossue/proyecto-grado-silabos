<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id
 * @property bool $activo
 * @property string $calidad
 * @property string|null $sustento_tipo
 * @property string|null $sustento_numero
 * @property-read User $user
 * @property-read Career $career
 */
class CoordinatorAssignment extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $table = 'asignaciones_coordinador';

    /** @var list<string> */
    protected $fillable = [
        'usuario_id', 'carrera_id', 'activo',
        'calidad', 'sustento_tipo', 'sustento_numero', 'sustento_fecha',
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

    /** @return BelongsTo<Career, $this> */
    public function career(): BelongsTo
    {
        return $this->belongsTo(Career::class, 'carrera_id');
    }

    /** @param Builder<CoordinatorAssignment> $query */
    public function scopeEffective(Builder $query): void
    {
        $query->where('activo', true);
    }
}
