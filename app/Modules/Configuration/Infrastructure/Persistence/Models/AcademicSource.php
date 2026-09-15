<?php

namespace App\Modules\Configuration\Infrastructure\Persistence\Models;

use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Support\Database\MapsLegacyColumnNames;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Documento de apoyo que la Coordinación entrega a los docentes de su carrera.
 *
 * @property string $id
 * @property string $carrera_id
 * @property string $nombre
 * @property string|null $descripcion
 * @property string|null $contenido
 * @property bool $activo
 */
class AcademicSource extends Model
{
    use HasUuids, MapsLegacyColumnNames;

    protected const LEGACY_COLUMN_ALIASES = [
        'nombre' => 'nombre_fuente_academica',
        'descripcion' => 'descripcion_fuente_academica',
        'contenido' => 'contenido_fuente_academica',
        'activo' => 'fuente_academica_activa',
    ];

    public $timestamps = false;

    protected $table = 'fuentes_academicas';

    /** @var list<string> */
    protected $fillable = ['carrera_id', 'nombre', 'descripcion', 'contenido', 'activo'];

    /** @return BelongsTo<Career, $this> */
    public function career(): BelongsTo
    {
        return $this->belongsTo(Career::class, 'carrera_id');
    }
}
