<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Faculty extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $table = 'facultades';

    /** @var list<string> */
    protected $fillable = ['codigo_institucional', 'nombre', 'logo_ruta', 'activo'];

    /** @return HasMany<Career, $this> */
    public function careers(): HasMany
    {
        return $this->hasMany(Career::class, 'facultad_id');
    }
}
