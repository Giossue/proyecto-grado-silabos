<?php

namespace App\Modules\Syllabus\Infrastructure\Persistence\Models;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateVersion;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;

/**
 * @property string $id
 * @property string $convocatoria_id
 * @property string $estado
 * @property int $lock_version
 * @property string $porcentaje_completitud
 * @property int $unresolved_observations_count
 * @property array<string, mixed> $contexto_academico
 * @property CarbonImmutable|null $guardado_en
 * @property-read Convocation $convocation
 * @property-read Subject $subject
 * @property-read TemplateVersion $templateVersion
 */
class Syllabus extends Model
{
    use HasUuids;

    protected $table = 'silabos';

    /** @var list<string> */
    protected $fillable = [
        'convocatoria_id', 'asignatura_id', 'version_malla_id', 'version_plantilla_id', 'estado',
        'contexto_academico', 'lock_version', 'porcentaje_completitud', 'iniciado_en', 'guardado_en',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'lock_version' => 'integer',
            'contexto_academico' => 'array',
            'porcentaje_completitud' => 'decimal:2',
            'iniciado_en' => 'immutable_datetime',
            'guardado_en' => 'immutable_datetime',
        ];
    }

    public function academicSubjectName(): string
    {
        $name = data_get($this->contexto_academico, 'subject.name');

        return is_string($name) ? $name : $this->subject->nombre;
    }

    public function academicSubjectCode(): string
    {
        $code = data_get($this->contexto_academico, 'subject.code');

        return is_string($code) ? $code : $this->subject->codigo_institucional;
    }

    /** @return BelongsTo<Convocation, $this> */
    public function convocation(): BelongsTo
    {
        return $this->belongsTo(Convocation::class, 'convocatoria_id');
    }

    /** @return BelongsTo<Subject, $this> */
    public function subject(): BelongsTo
    {
        return $this->belongsTo(Subject::class, 'asignatura_id');
    }

    /** @return BelongsTo<TemplateVersion, $this> */
    public function templateVersion(): BelongsTo
    {
        return $this->belongsTo(TemplateVersion::class, 'version_plantilla_id');
    }

    /** @return HasMany<SyllabusScope, $this> */
    public function scopes(): HasMany
    {
        return $this->hasMany(SyllabusScope::class, 'silabo_id');
    }

    /** @return HasMany<SyllabusCollaborator, $this> */
    public function collaborators(): HasMany
    {
        return $this->hasMany(SyllabusCollaborator::class, 'silabo_id');
    }

    /** @return BelongsToMany<User, $this> */
    public function teachers(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'colaboradores_silabo', 'silabo_id', 'usuario_id');
    }

    /** @return HasMany<FieldValue, $this> */
    public function values(): HasMany
    {
        return $this->hasMany(FieldValue::class, 'silabo_id');
    }

    /** @return HasMany<RepeatableRow, $this> */
    public function rows(): HasMany
    {
        return $this->hasMany(RepeatableRow::class, 'silabo_id');
    }

    /** @return HasMany<ValidationRun, $this> */
    public function validationRuns(): HasMany
    {
        return $this->hasMany(ValidationRun::class, 'silabo_id');
    }

    /** @return HasMany<SyllabusRevision, $this> */
    public function revisions(): HasMany
    {
        return $this->hasMany(SyllabusRevision::class, 'silabo_id');
    }

    /** @return HasManyThrough<ReviewObservation, SyllabusRevision, $this> */
    public function reviewObservations(): HasManyThrough
    {
        return $this->hasManyThrough(
            ReviewObservation::class,
            SyllabusRevision::class,
            'silabo_id',
            'revision_silabo_id',
        );
    }

    /** @return HasMany<Approval, $this> */
    public function approvals(): HasMany
    {
        return $this->hasMany(Approval::class, 'silabo_id');
    }

    /** @return HasMany<Reopening, $this> */
    public function reopenings(): HasMany
    {
        return $this->hasMany(Reopening::class, 'silabo_id');
    }

    /** @return HasMany<SyllabusTransition, $this> */
    public function transitions(): HasMany
    {
        return $this->hasMany(SyllabusTransition::class, 'silabo_id');
    }
}
