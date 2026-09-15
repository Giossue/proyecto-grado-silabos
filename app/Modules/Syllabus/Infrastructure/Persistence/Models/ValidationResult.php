<?php

namespace App\Modules\Syllabus\Infrastructure\Persistence\Models;

use App\Support\Database\MapsLegacyColumnNames;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ValidationResult extends Model
{
    use HasUuids, MapsLegacyColumnNames;

    protected const LEGACY_COLUMN_ALIASES = [
        'codigo' => 'codigo_resultado_validacion',
        'severidad' => 'severidad_resultado_validacion',
        'mensaje' => 'mensaje_resultado_validacion',
    ];

    public $timestamps = false;

    protected $table = 'resultados_validacion';

    /** @var list<string> */
    protected $fillable = ['ejecucion_validacion_id', 'definicion_campo_id', 'codigo', 'severidad', 'mensaje'];
}
