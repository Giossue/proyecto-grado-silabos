<?php

namespace App\Modules\AiAssistance\Infrastructure\Persistence\Models;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Concerns\ImmutableRecord;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id
 * @property string $ejecucion_ia_id
 * @property string $fuente_academica_id
 * @property string $version_fuente_id
 * @property string $fragmento_fuente_id
 * @property string $nombre_fuente
 * @property string $autoridad_fuente
 * @property int $numero_version
 * @property string $clave_fragmento
 * @property string $titulo_fragmento
 * @property string|null $clave_dato
 * @property string $extracto
 * @property string $huella_fragmento
 */
class AiEvidence extends Model
{
    use HasUuids, ImmutableRecord;

    public const UPDATED_AT = null;

    protected $table = 'evidencias_ia';

    /** @var list<string> */
    protected $fillable = [
        'ejecucion_ia_id', 'fuente_academica_id', 'version_fuente_id', 'fragmento_fuente_id',
        'nombre_fuente', 'autoridad_fuente', 'numero_version', 'clave_fragmento',
        'titulo_fragmento', 'clave_dato', 'extracto', 'huella_fragmento',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['numero_version' => 'integer'];
    }

    /** @return BelongsTo<AiExecution, $this> */
    public function execution(): BelongsTo
    {
        return $this->belongsTo(AiExecution::class, 'ejecucion_ia_id');
    }
}
