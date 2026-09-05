<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use App\Modules\Academic\Domain\StudyModality;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string $id
 * @property string $codigo_institucional
 * @property string $nombre
 * @property int|null $ciclo
 * @property int $orden_en_ciclo
 * @property string|null $unidad_organizacion_curricular
 * @property StudyModality|null $modalidad
 * @property string|null $creditos
 * @property int|null $horas_totales
 * @property string|null $horas_proyecto
 * @property string|null $horas_ap
 * @property string|null $horas_ac
 * @property string|null $horas_pae
 * @property string|null $horas_aa
 * @property string|null $horas_paec
 * @property bool $activo
 * @property string $malla_id
 * @property-read Curriculum $curriculum
 */
class Subject extends Model
{
    use HasUuids;

    public const CREATED_AT = 'creado_en';

    public const UPDATED_AT = 'actualizado_en';

    protected $table = 'asignaturas';

    /** @var list<string> */
    protected $fillable = [
        'malla_id',
        'codigo_institucional',
        'nombre',
        'ciclo',
        'orden_en_ciclo',
        'unidad_organizacion_curricular',
        'modalidad',
        'creditos',
        'horas_totales',
        'horas_proyecto',
        'horas_ap',
        'horas_ac',
        'horas_pae',
        'horas_aa',
        'horas_paec',
        'activo',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'ciclo' => 'integer',
            'modalidad' => StudyModality::class,
            'orden_en_ciclo' => 'integer',
            'creditos' => 'decimal:2',
            'horas_totales' => 'integer',
            'horas_proyecto' => 'decimal:2',
            'horas_ap' => 'decimal:2',
            'horas_ac' => 'decimal:2',
            'horas_pae' => 'decimal:2',
            'horas_aa' => 'decimal:2',
            'horas_paec' => 'decimal:2',
            'activo' => 'boolean',
        ];
    }

    /** @return BelongsTo<Curriculum, $this> */
    public function curriculum(): BelongsTo
    {
        return $this->belongsTo(Curriculum::class, 'malla_id');
    }

    /** @return HasMany<CourseOffering, $this> */
    public function offerings(): HasMany
    {
        return $this->hasMany(CourseOffering::class, 'asignatura_id');
    }

    /** @return HasMany<SubjectFieldValue, $this> */
    public function fieldValues(): HasMany
    {
        return $this->hasMany(SubjectFieldValue::class, 'asignatura_id');
    }

    /** @return HasMany<SubjectRequirement, $this> */
    public function requirements(): HasMany
    {
        return $this->hasMany(SubjectRequirement::class, 'asignatura_id');
    }

    /** @return HasMany<SubjectRequirement, $this> */
    public function requiredBy(): HasMany
    {
        return $this->hasMany(SubjectRequirement::class, 'requisito_id');
    }
}
