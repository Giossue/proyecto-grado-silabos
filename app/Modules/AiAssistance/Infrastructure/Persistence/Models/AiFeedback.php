<?php

namespace App\Modules\AiAssistance\Infrastructure\Persistence\Models;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Concerns\ImmutableRecord;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** @property string $id @property string $decision @property string $usuario_id */
class AiFeedback extends Model
{
    use HasUuids, ImmutableRecord;

    public const UPDATED_AT = null;

    protected $table = 'retroalimentacion_ia';

    /** @var list<string> */
    protected $fillable = [
        'recomendacion_ia_id', 'usuario_id', 'asignacion_rol_id', 'decision',
        'contenido_antes', 'contenido_despues', 'lock_version_origen',
        'lock_version_resultado', 'decidido_en',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'lock_version_origen' => 'integer',
            'lock_version_resultado' => 'integer',
            'decidido_en' => 'immutable_datetime',
        ];
    }

    /** @return BelongsTo<AiRecommendation, $this> */
    public function recommendation(): BelongsTo
    {
        return $this->belongsTo(AiRecommendation::class, 'recomendacion_ia_id');
    }
}
