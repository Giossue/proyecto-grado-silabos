<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string $id
 * @property string $version_malla_id
 * @property string $clave
 * @property string $etiqueta
 * @property string $tipo
 * @property string|null $clave_sistema
 * @property int $posicion
 * @property bool $visible_en_tarjeta
 * @property bool $totalizable
 * @property bool $activo
 */
class CurriculumFieldDefinition extends Model
{
    use HasUuids;

    public const CREATED_AT = 'creado_en';

    public const UPDATED_AT = 'actualizado_en';

    protected $table = 'definiciones_campo_malla';

    /** @var list<string> */
    protected $fillable = [
        'version_malla_id',
        'clave',
        'etiqueta',
        'tipo',
        'clave_sistema',
        'posicion',
        'visible_en_tarjeta',
        'totalizable',
        'activo',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'posicion' => 'integer',
            'visible_en_tarjeta' => 'boolean',
            'totalizable' => 'boolean',
            'activo' => 'boolean',
        ];
    }

    /** @return BelongsTo<CurriculumVersion, $this> */
    public function curriculumVersion(): BelongsTo
    {
        return $this->belongsTo(CurriculumVersion::class, 'version_malla_id');
    }

    /** @return HasMany<SubjectFieldValue, $this> */
    public function values(): HasMany
    {
        return $this->hasMany(SubjectFieldValue::class, 'definicion_campo_id');
    }
}
