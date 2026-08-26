<?php

namespace App\Modules\Configuration\Infrastructure\Persistence\Models;

use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AcademicSource extends Model
{
    use HasUuids;

    protected $table = 'fuentes_academicas';

    /** @var list<string> */
    protected $fillable = ['carrera_id', 'nombre', 'tipo', 'autoridad', 'responsable', 'descripcion', 'activo'];

    /** @return BelongsTo<Career, $this> */
    public function career(): BelongsTo
    {
        return $this->belongsTo(Career::class, 'carrera_id');
    }

    /** @return HasMany<SourceVersion, $this> */
    public function versions(): HasMany
    {
        return $this->hasMany(SourceVersion::class, 'fuente_academica_id');
    }
}
