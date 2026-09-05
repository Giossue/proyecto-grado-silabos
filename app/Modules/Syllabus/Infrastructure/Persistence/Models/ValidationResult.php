<?php

namespace App\Modules\Syllabus\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class ValidationResult extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $table = 'resultados_validacion';

    /** @var list<string> */
    protected $fillable = ['ejecucion_validacion_id', 'definicion_campo_id', 'codigo', 'severidad', 'mensaje'];
}
