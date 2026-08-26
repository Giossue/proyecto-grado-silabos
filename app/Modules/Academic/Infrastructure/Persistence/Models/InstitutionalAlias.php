<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Traduce el texto libre de la fuente institucional hacia un catálogo normalizado.
 * La fuente escribe MATRIZ, GUARANDA, SAN MIGUEL o LAS NAVES sin respetar su propio
 * catálogo `centro`; el catálogo del sistema se conserva y la equivalencia se registra
 * aquí para que la importación sea auditable.
 *
 * @property string $id
 * @property string $tipo_entidad
 * @property string $alias
 * @property string $entidad_id
 * @property string $origen
 */
class InstitutionalAlias extends Model
{
    use HasUuids;

    protected $table = 'alias_institucionales';

    /** @var list<string> */
    protected $fillable = ['tipo_entidad', 'alias', 'entidad_id', 'origen', 'registrado_por'];

    /** @return BelongsTo<User, $this> */
    public function registeredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'registrado_por');
    }
}
