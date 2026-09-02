<?php

namespace App\Modules\Identity\Infrastructure\Persistence\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Role extends Model
{
    use HasUuids;

    public const CREATED_AT = 'creado_en';

    public const UPDATED_AT = 'actualizado_en';

    protected $table = 'roles';

    /** @var list<string> */
    protected $fillable = ['codigo', 'nombre'];

    /** @return BelongsToMany<User, $this> */
    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'asignaciones_rol', 'rol_id', 'usuario_id')
            ->withPivot(['id', 'carrera_id', 'activo'])
            ->withTimestamps('creado_en', 'actualizado_en');
    }
}
