<?php

namespace App\Modules\Operations\Infrastructure\Persistence\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use LogicException;

/**
 * @property string $id
 * @property string $tipo_evento
 * @property string $clave_deduplicacion
 * @property array<string, mixed> $payload
 * @property string $estado
 * @property int $intentos
 * @property CarbonImmutable $ocurrido_en
 */
class OutboxEvent extends Model
{
    use HasUuids;

    protected $table = 'eventos_outbox';

    /** @var list<string> */
    protected $fillable = [
        'tipo_agregado', 'agregado_id', 'tipo_evento', 'clave_deduplicacion',
        'payload', 'estado', 'intentos', 'disponible_en', 'procesado_en',
        'codigo_error', 'mensaje_error', 'ocurrido_en',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'intentos' => 'integer',
            'disponible_en' => 'immutable_datetime',
            'procesado_en' => 'immutable_datetime',
            'ocurrido_en' => 'immutable_datetime',
        ];
    }

    protected static function booted(): void
    {
        static::updating(function (OutboxEvent $event): void {
            $mutable = ['estado', 'intentos', 'disponible_en', 'procesado_en', 'codigo_error', 'mensaje_error', 'updated_at'];
            if (array_diff(array_keys($event->getDirty()), $mutable) !== []) {
                throw new LogicException('La identidad y payload del outbox son inmutables.');
            }
        });
        static::deleting(fn () => throw new LogicException('Un evento outbox no puede eliminarse.'));
    }
}
