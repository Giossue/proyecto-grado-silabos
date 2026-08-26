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
 * @property string $plantilla_id
 * @property int $numero_version
 * @property string $estado
 * @property array<string, mixed>|null $mapeo_documento
 * @property string|null $huella_sha256
 * @property CarbonImmutable|null $publicado_en
 */
class TemplateVersion extends Model
{
    use HasUuids;

    protected $table = 'versiones_plantilla';

    /** @var list<string> */
    protected $fillable = [
        'plantilla_id',
        'numero_version',
        'estado',
        'mapeo_documento',
        'huella_sha256',
        'publicado_por',
        'publicado_en',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'numero_version' => 'integer',
            'mapeo_documento' => 'array',
            'publicado_en' => 'immutable_datetime',
        ];
    }

    /** @return BelongsTo<SyllabusTemplate, $this> */
    public function template(): BelongsTo
    {
        return $this->belongsTo(SyllabusTemplate::class, 'plantilla_id');
    }

    /** @return BelongsTo<User, $this> */
    public function publisher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'publicado_por');
    }

    /** @return HasMany<TemplateSection, $this> */
    public function sections(): HasMany
    {
        return $this->hasMany(TemplateSection::class, 'version_plantilla_id')->orderBy('posicion');
    }

    /** @return HasMany<TemplateBlock, $this> */
    public function blocks(): HasMany
    {
        return $this->hasMany(TemplateBlock::class, 'version_plantilla_id');
    }

    /** @return HasMany<FieldDefinition, $this> */
    public function fields(): HasMany
    {
        return $this->hasMany(FieldDefinition::class, 'version_plantilla_id');
    }

    protected static function booted(): void
    {
        static::updating(function (TemplateVersion $version): void {
            if ($version->getOriginal('estado') === 'published') {
                throw new LogicException('Una versión de plantilla publicada es inmutable.');
            }
        });
        static::deleting(function (TemplateVersion $version): void {
            if ($version->estado === 'published') {
                throw new LogicException('Una versión de plantilla publicada no puede eliminarse.');
            }
        });
    }
}
