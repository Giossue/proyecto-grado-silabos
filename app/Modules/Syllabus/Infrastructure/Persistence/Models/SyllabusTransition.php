<?php

namespace App\Modules\Syllabus\Infrastructure\Persistence\Models;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Concerns\ImmutableRecord;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/** @property string $id @property string $accion @property CarbonImmutable $ocurrido_en */
class SyllabusTransition extends Model
{
    use HasUuids;
    use ImmutableRecord;

    public const UPDATED_AT = null;

    protected $table = 'transiciones_silabo';

    /** @var list<string> */
    protected $fillable = [
        'silabo_id', 'revision_silabo_id', 'estado_origen', 'estado_destino',
        'accion', 'actor_usuario_id', 'asignacion_rol_id', 'metadatos', 'ocurrido_en',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['metadatos' => 'array', 'ocurrido_en' => 'immutable_datetime'];
    }
}
