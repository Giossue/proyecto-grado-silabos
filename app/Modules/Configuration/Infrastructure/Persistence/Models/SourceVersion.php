<?php

namespace App\Modules\Configuration\Infrastructure\Persistence\Models;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use LogicException;

/**
 * @property string $id
 * @property string $fuente_academica_id
 * @property int $numero_version
 * @property string $estado
 * @property CarbonImmutable|null $vigente_desde
 * @property CarbonImmutable|null $vigente_hasta
 * @property string|null $huella_sha256
 * @property CarbonImmutable|null $activado_en
 */
class SourceVersion extends Model
{
    use HasUuids;

    protected $table = 'versiones_fuente';

    /** @var list<string> */
    protected $fillable = [
        'fuente_academica_id',
        'numero_version',
        'estado',
        'vigente_desde',
        'vigente_hasta',
        'huella_sha256',
        'activado_por',
        'activado_en',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'numero_version' => 'integer',
            'vigente_desde' => 'immutable_date',
            'vigente_hasta' => 'immutable_date',
            'activado_en' => 'immutable_datetime',
        ];
    }

    /** @return BelongsTo<AcademicSource, $this> */
    public function source(): BelongsTo
    {
        return $this->belongsTo(AcademicSource::class, 'fuente_academica_id');
    }

    /** @return BelongsTo<User, $this> */
    public function activator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'activado_por');
    }

    /** @return HasMany<SourceFragment, $this> */
    public function fragments(): HasMany
    {
        return $this->hasMany(SourceFragment::class, 'version_fuente_id')->orderBy('posicion');
    }

    protected static function booted(): void
    {
        static::updating(function (SourceVersion $version): void {
            if (in_array($version->getOriginal('estado'), ['active', 'superseded'], true)) {
                $semanticChanges = array_diff(array_keys($version->getDirty()), ['estado', 'updated_at']);

                if ($semanticChanges !== []) {
                    throw new LogicException('El contenido y la vigencia de una fuente activada son inmutables.');
                }
            }
        });
        static::deleting(function (SourceVersion $version): void {
            if ($version->estado !== 'draft') {
                throw new LogicException('Una versión de fuente activada no puede eliminarse.');
            }
        });
    }
}
