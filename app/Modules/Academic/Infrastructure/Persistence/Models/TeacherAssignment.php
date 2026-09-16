<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Support\Database\MapsLegacyColumnNames;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id
 * @property string|null $asignacion_rol_id
 * @property bool $activo
 * @property-read RoleAssignment $roleAssignment
 * @property-read Parallel $parallel
 */
class TeacherAssignment extends Model
{
    use HasUuids, MapsLegacyColumnNames;

    protected const LEGACY_COLUMN_ALIASES = [
        'activo' => 'docente_paralelo_activo',
    ];

    public const CREATED_AT = 'asignado_en';

    public const UPDATED_AT = null;

    protected $table = 'asignaciones_paralelo';

    /** @var list<string> */
    protected $fillable = [
        'asignacion_rol_id',
        // Entrada de casos de uso/UI; antes de guardar se traduce al rol con alcance.
        'usuario_id',
        'paralelo_id',
        'activo',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['activo' => 'boolean'];
    }

    protected static function booted(): void
    {
        static::creating(function (self $assignment): void {
            if (array_key_exists('asignacion_rol_id', $assignment->getAttributes())) {
                return;
            }

            // `usuario_id` solo es una entrada de compatibilidad. El accessor deriva el
            // valor para registros persistidos, así que al crear hay que leer el atributo
            // crudo antes de que exista `asignacion_rol_id`.
            $userId = $assignment->getAttributes()['usuario_id'] ?? null;
            $careerId = Parallel::query()
                ->whereKey($assignment->paralelo_id)
                ->whereHas('scheduledSubject.subject')
                ->with('scheduledSubject.subject:id,carrera_id')
                ->firstOrFail()
                ->scheduledSubject->subject->carrera_id;

            $assignment->asignacion_rol_id = RoleAssignment::query()
                ->effective()
                ->where('usuario_id', $userId)
                ->where('carrera_id', $careerId)
                ->where('rol', RoleCode::Teacher->value)
                ->valueOrFail('id');
            $assignment->offsetUnset('usuario_id');
        });
    }

    /** @return BelongsTo<RoleAssignment, $this> */
    public function roleAssignment(): BelongsTo
    {
        return $this->belongsTo(RoleAssignment::class, 'asignacion_rol_id');
    }

    /**
     * Usuario derivado del rol que respalda la responsabilidad de paralelo.
     *
     * @return Attribute<string|null, string|null>
     */
    protected function usuarioId(): Attribute
    {
        return Attribute::make(
            get: function (): ?string {
                if (array_key_exists('usuario_id', $this->attributes)) {
                    return $this->attributes['usuario_id'];
                }

                if ($this->relationLoaded('roleAssignment')) {
                    return $this->roleAssignment->usuario_id;
                }

                return $this->roleAssignment()->value('usuario_id');
            },
            set: fn (mixed $value): array => ['usuario_id' => $value],
        );
    }

    /** @return BelongsTo<Parallel, $this> */
    public function parallel(): BelongsTo
    {
        return $this->belongsTo(Parallel::class, 'paralelo_id');
    }

    /** @param Builder<TeacherAssignment> $query */
    public function scopeForUser(Builder $query, string $userId): void
    {
        $query->whereHas('roleAssignment', fn (Builder $role): Builder => $role->where('usuario_id', $userId));
    }
}
