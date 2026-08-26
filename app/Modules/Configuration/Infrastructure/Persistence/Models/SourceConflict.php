<?php

namespace App\Modules\Configuration\Infrastructure\Persistence\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SourceConflict extends Model
{
    use HasUuids;

    protected $table = 'conflictos_fuente';

    /** @var list<string> */
    protected $fillable = [
        'version_candidata_id',
        'version_activa_id',
        'clave_dato',
        'huella_candidata',
        'huella_activa',
        'estado',
        'decision',
        'justificacion',
        'resuelto_por',
        'resuelto_en',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['resuelto_en' => 'immutable_datetime'];
    }

    /** @return BelongsTo<SourceVersion, $this> */
    public function candidateVersion(): BelongsTo
    {
        return $this->belongsTo(SourceVersion::class, 'version_candidata_id');
    }

    /** @return BelongsTo<SourceVersion, $this> */
    public function activeVersion(): BelongsTo
    {
        return $this->belongsTo(SourceVersion::class, 'version_activa_id');
    }

    /** @return BelongsTo<User, $this> */
    public function resolver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resuelto_por');
    }
}
