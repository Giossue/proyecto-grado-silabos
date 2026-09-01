<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string $id
 * @property string $codigo
 * @property bool $activo
 * @property-read CourseOffering $offering
 */
class Parallel extends Model
{
    use HasUuids;

    public const CREATED_AT = 'creado_en';

    public const UPDATED_AT = 'actualizado_en';

    protected $table = 'paralelos';

    /** @var list<string> */
    protected $fillable = ['oferta_academica_id', 'codigo', 'activo'];

    /** @return BelongsTo<CourseOffering, $this> */
    public function offering(): BelongsTo
    {
        return $this->belongsTo(CourseOffering::class, 'oferta_academica_id');
    }

    /** @return HasMany<TeacherAssignment, $this> */
    public function teacherAssignments(): HasMany
    {
        return $this->hasMany(TeacherAssignment::class, 'paralelo_id');
    }
}
