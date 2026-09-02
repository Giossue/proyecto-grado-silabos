<?php

namespace App\Modules\Identity\Infrastructure\Persistence\Models;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $usuario_id
 * @property string $rol_id
 * @property string|null $carrera_id
 * @property CarbonImmutable $vigente_desde
 * @property CarbonImmutable|null $vigente_hasta
 * @property bool $activo
 * @property-read Role $role
 * @property-read Career|null $career
 */
class RoleAssignment extends Model
{
    use HasUuids;

    public const CREATED_AT = 'creado_en';

    public const UPDATED_AT = 'actualizado_en';

    protected $table = 'asignaciones_rol';

    /** @var list<string> */
    protected $fillable = [
        'usuario_id',
        'rol_id',
        'carrera_id',
        'vigente_desde',
        'vigente_hasta',
        'activo',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'vigente_desde' => 'immutable_datetime',
            'vigente_hasta' => 'immutable_datetime',
            'activo' => 'boolean',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'usuario_id');
    }

    /** @return BelongsTo<Role, $this> */
    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class, 'rol_id');
    }

    /** @return BelongsTo<Career, $this> */
    public function career(): BelongsTo
    {
        return $this->belongsTo(Career::class, 'carrera_id');
    }

    /** @param Builder<RoleAssignment> $query */
    public function scopeEffective(Builder $query, ?Carbon $at = null): void
    {
        $instant = $at ?? now();

        $query
            ->where('activo', true)
            ->where('vigente_desde', '<=', $instant)
            ->where(fn (Builder $builder) => $builder
                ->whereNull('vigente_hasta')
                ->orWhere('vigente_hasta', '>', $instant));
    }
}
