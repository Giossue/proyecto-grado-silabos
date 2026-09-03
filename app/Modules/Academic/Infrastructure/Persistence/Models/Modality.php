<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Modality extends Model
{
    use HasUuids;

    public const CREATED_AT = 'creado_en';

    public const UPDATED_AT = 'actualizado_en';

    protected $table = 'modalidades';

    /** @var list<string> */
    protected $fillable = ['codigo', 'nombre', 'combina_por_asignatura', 'activo'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['combina_por_asignatura' => 'boolean', 'activo' => 'boolean'];
    }
}
