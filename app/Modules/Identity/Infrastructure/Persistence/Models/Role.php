<?php

namespace App\Modules\Identity\Infrastructure\Persistence\Models;

use App\Models\User;
use App\Support\Database\MapsLegacyColumnNames;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Role extends Model
{
    use HasUuids, MapsLegacyColumnNames;

    protected const LEGACY_COLUMN_ALIASES = [
        'codigo' => 'codigo_rol',
        'nombre' => 'nombre_rol',
    ];

    public $timestamps = false;

    protected $table = 'roles';

    /** @var list<string> */
    protected $fillable = ['codigo_rol', 'nombre_rol'];

    /** @return BelongsToMany<User, $this> */
    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'asignaciones_rol', 'rol_id', 'usuario_id')
            ->withPivot(['id', 'carrera_id', 'asignacion_rol_activa', 'asignado_en']);
    }
}
