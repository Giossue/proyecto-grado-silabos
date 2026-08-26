<?php

namespace App\Modules\Configuration\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

class SourceFragment extends Model
{
    use HasUuids;

    protected $table = 'fragmentos_fuente';

    /** @var list<string> */
    protected $fillable = [
        'version_fuente_id',
        'clave',
        'titulo',
        'contenido',
        'clave_dato',
        'valor_estructurado',
        'metadatos',
        'huella_sha256',
        'posicion',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'valor_estructurado' => 'array',
            'metadatos' => 'array',
            'posicion' => 'integer',
        ];
    }

    /** @return BelongsTo<SourceVersion, $this> */
    public function version(): BelongsTo
    {
        return $this->belongsTo(SourceVersion::class, 'version_fuente_id');
    }

    protected static function booted(): void
    {
        static::saving(fn (SourceFragment $fragment) => $fragment->guardDraft());
        static::deleting(fn (SourceFragment $fragment) => $fragment->guardDraft());
    }

    private function guardDraft(): void
    {
        $version = $this->version()->first();

        if ($version !== null && $version->estado !== 'draft') {
            throw new LogicException('Los fragmentos de una fuente activada son inmutables.');
        }
    }
}
