<?php

namespace App\Modules\Operations\Infrastructure\Persistence\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use LogicException;

/**
 * @property string $id
 * @property string $usuario_id
 * @property string $tipo
 * @property string $titulo
 * @property string $mensaje
 * @property string|null $tipo_recurso
 * @property string|null $recurso_id
 * @property CarbonImmutable|null $leido_en
 * @property CarbonImmutable $creado_en
 */
class InternalNotification extends Model
{
    use HasUuids;

    public const UPDATED_AT = null;

    protected $table = 'notificaciones_internas';

    /** @var list<string> */
    protected $fillable = [
        'usuario_id', 'clave_deduplicacion', 'tipo', 'titulo', 'mensaje',
        'tipo_recurso', 'recurso_id', 'leido_en', 'creado_en',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['leido_en' => 'immutable_datetime', 'creado_en' => 'immutable_datetime'];
    }

    protected static function booted(): void
    {
        static::updating(function (InternalNotification $notification): void {
            if (array_diff(array_keys($notification->getDirty()), ['leido_en']) !== []) {
                throw new LogicException('El contenido de una notificación es inmutable.');
            }
        });
        static::deleting(fn () => throw new LogicException('Una notificación no puede eliminarse.'));
    }
}
