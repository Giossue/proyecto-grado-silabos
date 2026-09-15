<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use App\Support\Database\MapsLegacyColumnNames;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Faculty extends Model
{
    use HasUuids, MapsLegacyColumnNames;

    protected const LEGACY_COLUMN_ALIASES = [
        'nombre' => 'nombre_facultad',
        'activo' => 'facultad_activa',
        'logo_ruta' => 'ruta_logo_facultad',
    ];

    public $timestamps = false;

    protected $table = 'facultades';

    /** @var list<string> */
    protected $fillable = ['codigo_facultad', 'nombre', 'logo_ruta', 'activo'];

    /** @return HasMany<Career, $this> */
    public function careers(): HasMany
    {
        return $this->hasMany(Career::class, 'facultad_id');
    }
}
