<?php

namespace App\Modules\Operations\Infrastructure\Persistence\Models;

use App\Models\User;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

/**
 * @property string $id
 * @property string|null $actor_usuario_id
 * @property string|null $asignacion_rol_id
 * @property string $accion
 * @property string $tipo_recurso
 * @property string|null $recurso_id
 * @property string $resultado
 * @property array<string, mixed>|null $metadatos
 * @property string|null $correlation_id
 * @property CarbonImmutable $ocurrido_en
 * @property-read User|null $actor
 * @property-read RoleAssignment|null $roleAssignment
 */
class AuditEvent extends Model
{
    use HasUuids;

    public const UPDATED_AT = null;

    protected $table = 'eventos_auditoria';

    /** @var list<string> */
    protected $fillable = [
        'actor_usuario_id',
        'asignacion_rol_id',
        'accion',
        'tipo_recurso',
        'recurso_id',
        'resultado',
        'metadatos',
        'correlation_id',
        'ocurrido_en',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'metadatos' => 'array',
            'ocurrido_en' => 'immutable_datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_usuario_id');
    }

    /** @return BelongsTo<RoleAssignment, $this> */
    public function roleAssignment(): BelongsTo
    {
        return $this->belongsTo(RoleAssignment::class, 'asignacion_rol_id');
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Los eventos de auditoría son inmutables.'));
        static::deleting(fn () => throw new LogicException('Los eventos de auditoría son append-only.'));
    }
}
