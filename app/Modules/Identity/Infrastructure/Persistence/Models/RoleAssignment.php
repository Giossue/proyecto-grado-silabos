<?php

namespace App\Modules\Identity\Infrastructure\Persistence\Models;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Identity\Domain\FixedRole;
use App\Support\Database\MapsLegacyColumnNames;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id
 * @property string $usuario_id
 * @property string $rol
 * @property string|null $carrera_id
 * @property bool $activo
 * @property-read FixedRole $role
 * @property-read Career|null $career
 */
class RoleAssignment extends Model
{
    use HasUuids, MapsLegacyColumnNames;

    protected const LEGACY_COLUMN_ALIASES = [
        'activo' => 'asignacion_rol_activa',
    ];

    public const CREATED_AT = 'asignado_en';

    public const UPDATED_AT = null;

    protected $table = 'asignaciones_rol';

    /** @var list<string> */
    protected $fillable = [
        'usuario_id',
        'rol',
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

    /** @return Attribute<FixedRole, never> Valor fijo para la presentación de la asignación. */
    protected function role(): Attribute
    {
        return Attribute::get(fn (): FixedRole => FixedRole::fromCode($this->rol));
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
