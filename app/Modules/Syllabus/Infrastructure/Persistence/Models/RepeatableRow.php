<?php

namespace App\Modules\Syllabus\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * @property string $id
 * @property string $definicion_campo_id
 * @property array<string, mixed> $datos
 * @property int $posicion
 */
class RepeatableRow extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $table = 'filas_repetibles';

    /** @var list<string> */
    protected $fillable = ['silabo_id', 'definicion_campo_id', 'datos', 'posicion'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['datos' => 'array', 'posicion' => 'integer'];
    }
}
