<?php

namespace App\Modules\Configuration\Infrastructure\Persistence\Models;

use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
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
 * @property string|null $notas_internas
 * @property string|null $contenido
 * @property bool $activo
 */
class AcademicSource extends Model
{
    use HasUuids;

    protected $table = 'fuentes_academicas';

    /** @var list<string> */
    protected $fillable = ['carrera_id', 'nombre', 'descripcion', 'notas_internas', 'contenido', 'activo'];

    /** @return BelongsTo<Career, $this> */
    public function career(): BelongsTo
    {
        return $this->belongsTo(Career::class, 'carrera_id');
    }
}
