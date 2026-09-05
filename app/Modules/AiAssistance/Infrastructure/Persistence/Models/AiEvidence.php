<?php

namespace App\Modules\AiAssistance\Infrastructure\Persistence\Models;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Concerns\ImmutableRecord;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Fotografía de la fuente citada en el momento del análisis: nombre, extracto y huella
 * se conservan aunque la Coordinación edite el documento después.
 *
 * @property string $id
 * @property string $ejecucion_ia_id
 * @property string $fuente_academica_id
 * @property string $nombre_fuente
 * @property string $extracto
 * @property string $huella_contenido
 */
class AiEvidence extends Model
{
    use HasUuids, ImmutableRecord;

    public $timestamps = false;

    protected $table = 'evidencias_ia';

    /** @var list<string> */
    protected $fillable = [
        'ejecucion_ia_id', 'fuente_academica_id', 'nombre_fuente', 'extracto', 'huella_contenido',
    ];

    /** @return BelongsTo<AiExecution, $this> */
    public function execution(): BelongsTo
    {
        return $this->belongsTo(AiExecution::class, 'ejecucion_ia_id');
    }
}
