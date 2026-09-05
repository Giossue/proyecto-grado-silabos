<?php

namespace App\Modules\Identity\Infrastructure\Persistence\Models;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id
 * @property string $usuario_id
 * @property string $rol_id
 * @property string|null $carrera_id
 * @property bool $activo
 * @property-read Role $role
 * @property-read Career|null $career
 */
class RoleAssignment extends Model
{
    use HasUuids;

    public const CREATED_AT = 'asignado_en';

    public const UPDATED_AT = null;

    protected $table = 'asignaciones_rol';

    /** @var list<string> */
    protected $fillable = [
        'usuario_id',
        'rol_id',
        'carrera_id',
        'activo',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
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
    public function scopeEffective(Builder $query): void
    {
        $query->where('activo', true);
    }
}
