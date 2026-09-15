<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use App\Modules\Documents\Infrastructure\Persistence\Models\StoredObject;
use App\Support\Database\MapsLegacyColumnNames;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Faculty extends Model
{
    use HasUuids, MapsLegacyColumnNames;

    protected const LEGACY_COLUMN_ALIASES = [
        'nombre' => 'nombre_facultad',
        'activo' => 'facultad_activa',
    ];

    public $timestamps = false;

    protected $table = 'facultades';

    /** @var list<string> */
    protected $fillable = ['codigo_facultad', 'nombre', 'logo_objeto_id', 'activo'];

    /** @return BelongsTo<StoredObject, $this> */
    public function logoObject(): BelongsTo
    {
        return $this->belongsTo(StoredObject::class, 'logo_objeto_id');
    }

    /** @return HasMany<Career, $this> */
    public function careers(): HasMany
    {
        return $this->hasMany(Career::class, 'facultad_id');
    }
}
